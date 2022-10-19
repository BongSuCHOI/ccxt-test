const express = require('express');
const ccxt = require('ccxt');
const dotenv = require('dotenv');

// Setup
dotenv.config();
const app = express().use(express.json());
const PORT = process.env.PORT;

// Connect html, js
app.get('/', (req, res) => {
	res.sendFile(__dirname + '/src/index.html');
});

app.use(express.static('src'));

app.listen(PORT, () => {
	console.log(`🚀 Server running on port ${PORT}`);
});

// Catch the webhook
app.post('/webhook', (req, res) => {
	// console.log(req.body);
	handleTrade(req, res);
});

// Tradingview webhook message에 포함 된 auth_id와 동일한 auth_id
const AUTH_ID = process.env.AUTH_ID;

// Set end variable
const EXCHANGE = process.env.EXCHANGE;
const TICKER = process.env.TICKER;
const TEST_MODE = process.env.TEST_MODE == 'false' ? false : true;
const TESTNET_API_KEY = process.env.TESTNET_API_KEY;
const TESTNET_API_SECRET = process.env.TESTNET_API_SECRET;
const LIVE_API_KEY = process.env.API_KEY;
const LIVE_API_SECRET = process.env.API_SECRET;
const apiKey = TEST_MODE ? TESTNET_API_KEY : LIVE_API_KEY;
const apiSecret = TEST_MODE ? TESTNET_API_SECRET : LIVE_API_SECRET;

// Create an exchange instance
const exchange = new ccxt[EXCHANGE]({
	apiKey: apiKey,
	secret: apiSecret,
	enableRateLimit: true,
	options: {
		defaultType: 'future',
	},
});

// Check test mode
if (TEST_MODE) {
	exchange.setSandboxMode(true);
	console.log('Currently TESTING on', EXCHANGE);
	if (!apiKey || !apiSecret) {
		console.log("WARNING: You didn't set an API key and secret for this env");
	}
} else {
	console.log('Currently LIVE on', EXCHANGE);
	if (!apiKey || !apiSecret) {
		console.log("WARNING: You didn't set an API key and secret for this env");
	}
}

// Checks webhook carries a valid ID
const handleTrade = (req, res) => {
	let json = req.body;
	if (json.auth_id === AUTH_ID) {
		// executeTrade(json);
		res.status(200).end();
	} else {
		console.log('401 UNAUTHORIZED', json);
		res.status(401).end();
	}
};

//
// === Custom exchange trade methods ===
//

// order config
let od_type;
let od_side;
let od_amount;
let od_amount_rate;
let od_price;
let od_sl_rate;
let od_ts_rate;
let od_ts_trigger;
let od_leverage;
let limitAverageDown;
let averageDownRate;
let averageDownCount = 0;
let lastTradeDirection;

// Get balances from the exchange
const getBalances = async () => {
	const balance = await exchange.fetchBalance();
	const usdtBalance = Math.round(balance.free.USDT);
	return usdtBalance;
};

// Set leverage
const setLeverage = async (leverage) => {
	await exchange.setLeverage(leverage, TICKER);
};

// Create trailing stop
const trailingStop = async () => {
	// bybit
	const trailingSide = lastTradeDirection === 'buy' ? 'Buy' : 'Sell';
	const trailingParams = {
		symbol: TICKER,
		side: trailingSide,
		trailing_stop: od_ts_rate,
	};

	await exchange.privatePostPrivateLinearPositionTradingStop(trailingParams);

	// binance
	// const trailingParams = {
	// 	activationPrice: '20150',
	// 	callbackRate: '0.5',
	// };
	// const trailingSide = od_side === 'buy' ? 'sell' : 'buy';
	// await exchange.createOrder(
	// 	TICKER,
	// 	'TRAILING_STOP_MARKET',
	// 	trailingSide,
	// 	amount,
	// 	price,
	// 	trailingParams
	// );

	console.log('트레일링 스탑 시작');
};

// Average down
const averageDown = () => {
	openPosition();
	averageDownCount += 1;
	console.log(`물타기 ${averageDownCount}회`);
};

// Live price info
const liveTicker = async () => {
	// currunt position info
	const position = await exchange.fetchPositions([TICKER]);
	const averagePrice = Number(position[0].info.entry_price);
	const ts_triggerPrice = averagePrice + od_ts_trigger;
	const sl_TriggerPrice = averagePrice - Math.round(averagePrice * od_sl_rate);
	const averageDownPrice = averagePrice - Math.round(averagePrice * averageDownRate);

	console.log('현재 평단 :', averagePrice);
	console.log('물타기 가격 :', averageDownPrice);
	console.log('손절 가격 :', sl_TriggerPrice);
	console.log('TS 발동 가격 :', ts_triggerPrice);
	console.log('------------------------------------');

	// inquire price (bybit 초당 50회)
	while (true) {
		let tickerDetails = await exchange.fetchTicker(TICKER);

		// average down (현재가격 <= 트리거 가격 && 물타기 카운트 횟수 < 물타기 제한 횟수)
		if (tickerDetails.last <= averageDownPrice && averageDownCount < limitAverageDown) {
			averageDown();
			break;
		}

		// stop loss (현재가격 <= 트리거 가격 && 물타기 카운트 횟수 == 물타기 제한 횟수)
		if (tickerDetails.last <= sl_TriggerPrice && averageDownCount == limitAverageDown) {
			console.log('손절가 도달. 실시간 조회 종료');
			closePosition(position);
			break;
		}

		// trigger stop (현재가격 >= 트리거 가격)
		if (tickerDetails.last >= ts_triggerPrice) {
			console.log('익절가 도달. 실시간 조회 종료');
			trailingStop();
			break;
		}
	}
};

// Create open Position
const openPosition = async () => {
	lastTradeDirection = od_side;
	console.log(od_side, '포지션 오픈');
	await exchange.createOrder(TICKER, od_type, od_side, od_amount, od_price);
	await liveTicker();
};

// Create clode position
const closePosition = async (position) => {
	const closeSide = od_side === 'buy' ? 'sell' : 'buy';
	const amount = position[0].contracts;
	await exchange.createOrder(TICKER, od_type, closeSide, amount, od_price, {
		reduceOnly: true,
	});
	console.log('포지션 종료 (손절), 수량 :', amount);
};

//  executeTrade
const executeTrade = async (json) => {
	await exchange.loadMarkets();

	const position = await exchange.fetchPositions([TICKER]);
	const ticker = await exchange.fetchTicker(TICKER);
	const usdtBalance = await getBalances();
	const currentLeverage = position[0].leverage;
	const curruntPrice = ticker.last;

	/**
	 * od_amount_rate : 0.1 = 10% (포지션 진입 비율)
	 * od_amount : (전체잔고 * od_amount_rate) / 1 BTC당 레버리지 적용 가격
	 * od_sl_rate : 0.01 = 1% (손절 비율)
	 * od_ts_rate = 5; // 1 = 1$ (트레일링 스탑 비율)
	 * od_ts_trigger = 80; // 1 = 1$ (트레일링 스탑 수치)
	 * limitAverageDown = 2; // 1 = 1회 (물타기 횟수)
	 * averageDownRate = 0.003; // 0.01 = 1% (현재 평단 기준 물타기 비율)
	 */
	od_type = 'MARKET';
	od_side = 'buy';
	od_price = undefined;
	od_amount_rate = 0.1;
	od_amount = (usdtBalance * od_amount_rate) / (curruntPrice / currentLeverage);
	od_sl_rate = 0.005;
	od_ts_rate = 5;
	od_ts_trigger = 80;
	// od_leverage = json.leverage ? json.leverage : 10;
	od_leverage = 5;
	limitAverageDown = 2;
	averageDownRate = 0.003;

	if (currentLeverage !== od_leverage) {
		// setLeverage(json.leverage);
		setLeverage(od_leverage);
	}

	openPosition();
};
// executeTrade();

// CMO (chande momentum oscillator)
/**
 * 공식 참고
 * https://planetcalc.com/617/ (상단 수식 위에 본문)
 * https://www.motivewave.com/studies/chande_momentum_oscillator.htm (하단 코드)
 * 트레이딩뷰 > 헬프센터 > relative volatility index
 */
// const CMOcalc = (datas, length = 7) => {
// 	// 최근 8개 종가 데이터
// 	const closeDatas = datas.slice(-length - 1).map((data) => data[data.length - 2]);

// 	// 각 캔들 종가의 차이값
// 	let diffArr = [];

// 	for (let i = 1; i < closeDatas.length; i++) {
// 		const prev = closeDatas[closeDatas.length - (i + 1)];
// 		const curr = closeDatas[closeDatas.length - i];
// 		diffArr.push(curr - prev);
// 	}

// 	//차이값의 가장 높은 값의 합계(양수)
// 	const highSum = diffArr.reduce((acc, curr) => {
// 		const high = curr >= 0.0 ? curr : 0.0;
// 		return (acc += high);
// 	}, 0);

// 	// 차이값의 가장 낮은 값의 합계(음수)
// 	const lowSum = diffArr.reduce((acc, curr) => {
// 		const low = curr >= 0.0 ? 0.0 : Math.abs(curr);
// 		return (acc += low);
// 	}, 0);

// 	// 결과
// 	const cmo = 100 * ((highSum - lowSum) / (highSum + lowSum));
// 	console.log('CMO :', cmo.toFixed(2));
// 	return cmo.toFixed(2);
// };

// VO (volume oscillator)
/**
 * 트레이딩뷰 > vo지표 코드 보기(파인스크립트 해석)
 * EMA 구하는 법 구글링
 * 특이사항 : fetchOHLCV에 limit제한을 걸어버리면 비교 데이터가 적어서 그런지 수치가 다르게 나옴
 */
const VOcalc = async (datas, shortLength = 7, longLength = 14) => {
	// 최근 볼륨 데이터
	const volumeDatas = datas.map((data) => data[data.length - 1]);

	const shortAlpha = 2 / (shortLength + 1);
	const longAlpha = 2 / (longLength + 1);

	// EMA = alpha * currntVolume + (1 - alpha) * prevEMA;
	// 과거 데이터가 0번째 순으로
	const EMACalc = (volumes, alpha) => {
		let emaArray = [volumes[0]];
		for (let i = 1; i < volumes.length; i++) {
			emaArray.push(alpha * volumes[i] + (1 - alpha) * emaArray[i - 1]);
		}
		return emaArray[emaArray.length - 1];
	};

	const shortEMA = EMACalc(volumeDatas, shortAlpha);
	const longEMA = EMACalc(volumeDatas, longAlpha);

	// vo
	const vo = ((shortEMA - longEMA) / longEMA) * 100;
	console.log('VO :', vo.toFixed(2));
	return vo.toFixed(2);
};

// RVI (relative volatility index)
/**
 * 트레이딩뷰 > riv 지표 코드 보기(파인스크립트 해석)
 * https://www.hi-ib.com/upload/systemtrade/guide/RVI.pdf
 * marketvolume.com/technicalanalysis/relativevolatilityindex.asp
 */
const RVIcalc = async (datas, length = 7) => {
	// 최근 종가 데이터
	const closeDatas = datas.map((data) => data[data.length - 2]);
	const upperSTDs = [];
	const lowerSTDs = [];
	let stdevArr = [];

	// 표준 편차
	// https://sciencing.com/calculate-deviations-mean-sum-squares-5691381.html
	const standardDeviation = (arr, length) => {
		const sma = arr.reduce((acc, curr) => (acc += curr), 0) / length;
		const mean = arr.map((data) => data - sma);
		const stdevArr = [];
		let sumOfSquareDeviations = 0;

		for (let i = 0; i < mean.length; i++) {
			sumOfSquareDeviations = sumOfSquareDeviations + mean[i] * mean[i];
			stdevArr.push(Math.sqrt(sumOfSquareDeviations / length));
		}
		return stdevArr[stdevArr.length - 1];
	};

	// length 단위로 closeDatas slice후 표준 편차
	// ex) closeDatas = [1, 3, 5, 10, 30]
	// ex) slide = [1,3,5], [3,5,10], [5,10,30]
	// ex) stdevArr = [1.63, 2.94, 10.8]
	for (let i = 0; i < closeDatas.length - (length - 1); i++) {
		const sliceDatas = closeDatas.slice(i, length + i);
		stdevArr.push(standardDeviation(sliceDatas, length));
	}

	// upperSTDs = 현재가격 - 이전종가가 0보다 큰 경우 표준편차 / 최신 데이터가 0번째
	// lowerSTDs = 현재가격 - 이전종가가 0보다 작은 경우 표준편차 / 최신 데이터가 0번째
	for (let i = 0; i < stdevArr.length; i++) {
		const prev = closeDatas[closeDatas.length - (i + 2)];
		const curr = closeDatas[closeDatas.length - (i + 1)];
		upperSTDs.push(curr - prev <= 0 ? 0 : stdevArr[stdevArr.length - (i + 1)]);
		lowerSTDs.push(curr - prev > 0 ? 0 : stdevArr[stdevArr.length - (i + 1)]);
	}

	// EMA = alpha * currntVolume + (1 - alpha) * prevEMA;
	// 과거 데이터가 0번째 순으로
	const EMACalc = (volumes, length = 14) => {
		const alpha = 2 / (length + 1);
		let emaArray = [volumes[0]];
		for (let i = 1; i < volumes.length; i++) {
			emaArray.push(alpha * volumes[i] + (1 - alpha) * emaArray[i - 1]);
		}
		return emaArray[emaArray.length - 1];
	};

	const upperEMA = EMACalc(upperSTDs.slice().reverse());
	const lowerEMA = EMACalc(lowerSTDs.slice().reverse());

	// 결과
	const rvi = (upperEMA / (upperEMA + lowerEMA)) * 100;
	console.log('RVI :', rvi.toFixed(2));
	return rvi.toFixed(2);
};

async function init() {
	// executeTrade();
	const OHLCVdatas = await exchange.fetchOHLCV('BTC/USDT:USDT', '5m');
	VOcalc(OHLCVdatas);
	RVIcalc(OHLCVdatas);
	// CMOcalc(OHLCVdatas);
	// volatility();
	/**
	 * 아래 api들 합칠 수 있으면 합치자
	 * fetchPositions = 2개
	 * fetchTicker = 2개
	 * fetchOHLCV = 2개
	 */
}
init();

// 변동성 (잠깐 스탑 - cmo/vo/rvi 먼저 구해서 로직 짜보고 이어서)
// const volatility = async () => {
// 	// 공포 환의 계산 공식 사이트
// 	// https://alternative.me/crypto/fear-and-greed-index/
// 	// https://zipmex.com/learn/crypto-fear-and-greed-index-explained/

// 	// 현재 시간부터 3시간 전 까지 캔들 데이터
// 	const a = await exchange.fetchOHLCV('BTC/USDT:USDT', '1m');
// 	console.log(a[a.length - 1]);
// 	// [타임스탬프, 시가, 고가, 저가, 종가, 거래량];
// 	// 저 마지막 volum이 정확히 어떤건지 ccxt wiki 찾아봐야 할듯
// 	const b1 = 19932;
// 	const b2 = 19925;
// 	const b3 = 19908;
// 	const b4 = 19914;
// 	const b5 = 19895;

// 	// const ln1 = Math.log(b2 / b1);
// 	// const ln2 = Math.log(b3 / b2);
// 	// const ln3 = Math.log(b4 / b3);
// 	// const ln4 = Math.log(b5 / b4);

// 	// 표준 편차
// 	function standardDeviation(arr) {
// 		let mean =
// 			arr.reduce((acc, curr) => {
// 				return acc + curr;
// 			}, 0) / arr.length;

// 		arr = arr.map((el) => {
// 			return (el - mean) ** 2;
// 		});

// 		let total = arr.reduce((acc, curr) => acc + curr, 0);

// 		return Math.sqrt(total / arr.length);
// 	}

// 	console.log(standardDeviation([b1, b2, b3, b4, b5]) * Math.sqrt(5));
// };

/**
 * InvalidNonce: bybit {"ret_code":10002,"ret_msg":"invalid request,please check your server timestamp or recv_window param","ext_code":"","result":null,"ext_info":null,"time_now":1665457425564}
 * 위와 같은 에러가 난다면
 * const eTime = await exchange.fetch_time();
 * const mTime = await exchange.milliseconds();
 * console.log(eTime, mTime, mTime - eTime);
 * 찍어보고 1000이상 차이날 경우 컴퓨터 시간 동기화
 */

/**
 * 거래 시그널 계산 로직 웹소켓 처리 사례?
 * https://github.com/ccxt/ccxt/issues/12861#issue-1205977323
 */
