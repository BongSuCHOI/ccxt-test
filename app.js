const express = require('express');
const ccxt = require('ccxt');
const dotenv = require('dotenv');
const { indicator } = require('./src/indicators/index');

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
// app.post('/webhook', (req, res) => {
// 	// console.log(req.body);
// 	handleTrade(req, res);
// });

// Tradingview webhook message에 포함 된 auth_id와 동일한 auth_id
// const AUTH_ID = process.env.AUTH_ID;

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
// const handleTrade = (req, res) => {
// 	let json = req.body;
// 	if (json.auth_id === AUTH_ID) {
// 		// orderSetting(json);
// 		res.status(200).end();
// 	} else {
// 		console.log('401 UNAUTHORIZED', json);
// 		res.status(401).end();
// 	}
// };

//
// === Custom exchange trade methods ===
//

// order config
let od_type;
let od_side;
let od_amount;
let od_amount_rate;
let od_price;
let od_gap;
let od_sl_rate;
let od_ts_rate;
let od_ts_trigger_rate;
let od_leverage;
let od_stop_time;
let limitAverageDown;
let averageDownRate;
let averageDownCount = 0;
let lastTradeDirection;
let timer;

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

// Trading stop time
const tradingStopTime = () => {
	timer = setTimeout(() => {
		init();
	}, od_stop_time * 60 * 1000);
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
// 순환매 로직 구현 필요
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
	const ts_triggerPrice = averagePrice + averagePrice * (od_ts_trigger_rate * 0.001);
	const sl_TriggerPrice = averagePrice - Math.round(averagePrice * od_sl_rate);
	const averageDownPrice = averagePrice - Math.round(averagePrice * averageDownRate);

	console.log('현재 평단 :', averagePrice);
	console.log('물타기 가격 :', averageDownPrice);
	console.log('손절 가격 :', sl_TriggerPrice);
	console.log('TS 발동 가격 :', ts_triggerPrice);
	console.log('------------------------------------');

	// bybit-testnet 초당 20회
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
			tradingStopTime();
			break;
		}

		// trigger stop (현재가격 >= 트리거 가격)
		if (tickerDetails.last >= ts_triggerPrice) {
			console.log('익절가 도달. 실시간 조회 종료');
			trailingStop();
			tradingStopTime();
			break;
		}
	}
};

// Trade signal monitoring
const signalMonitoring = async () => {
	console.log(od_ts_rate);

	// bybit-testnet 초당 20회
	while (true) {
		const OHLCVdatas = await exchange.fetchOHLCV('BTC/USDT:USDT', '5m');
		const exceptCurrDatas = OHLCVdatas.slice(0, OHLCVdatas.length - 1);
		const CCI = indicator.CCI(exceptCurrDatas, 20);
		const SLOW_STOCH = indicator.SLOW_STOCH(exceptCurrDatas, 14, 85, 15, 3, 3);

		// console.log(
		// 	`CCI : ${CCI} | G_CROSS : ${SLOW_STOCH.goldCross} | OVER_S : ${SLOW_STOCH.OverSold} | D_CROSS : ${SLOW_STOCH.deadCross} | OVER_B : ${SLOW_STOCH.OverBought}`
		// );

		// long
		if (SLOW_STOCH.goldCross && SLOW_STOCH.OverSold && CCI < -125) {
			const lastPrice = OHLCVdatas[OHLCVdatas.length - 1][4];
			od_side = 'buy';
			od_price = lastPrice - od_gap;
			openPosition();
			break;
		}

		// short
		if (SLOW_STOCH.deadCross && SLOW_STOCH.OverBought && CCI > 125) {
			const lastPrice = OHLCVdatas[OHLCVdatas.length - 1][4];
			od_side = 'sell';
			od_price = lastPrice - od_gap;
			openPosition();
			break;
		}
	}
};

// Create open Position
const openPosition = async () => {
	lastTradeDirection = od_side;
	console.log(`포지션 오픈 : ${od_side} | 가격 : ${od_price} | 수량 : ${od_amount}`);
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
	console.log(`${lastTradeDirection} 포지션 종료 | 가격 : ${od_price} | 수량 : ${amount}`);
};

// Order setting
const orderSetting = async (
	type,
	gap,
	amount_rate,
	sl_rate,
	ts_rate,
	ts_trigger,
	leverage,
	stop_time,
	ad_limit_Count,
	ad_rate
) => {
	await exchange.loadMarkets();

	const position = await exchange.fetchPositions([TICKER]);
	const ticker = await exchange.fetchTicker(TICKER);
	const usdtBalance = await getBalances();
	const currentLeverage = position[0].leverage;
	const curruntPrice = ticker.last;

	/**
	 * od_gap : 현재 가격 기준 리밋 주문 가격 넣을 간격 // 현재가격 100, od_gap 10, 리밋롱주문 90, 리밋숏주문 110
	 * od_amount_rate : 0.1 = 10% (포지션 진입 비율)
	 * od_amount : (전체잔고 * od_amount_rate) / 1 BTC당 레버리지 적용 가격
	 * od_sl_rate : 0.01 = 1% (손절 비율)
	 * od_ts_rate : 1 = 1$ (트레일링 스탑 비율)
	 * od_ts_trigger_rate : 1 = 1% (트레일링 스탑 발동 비율)
	 * od_stop_time : 1 = 1분 (거래 종료 후 주문 중지 시간)
	 * limitAverageDown : 1 = 1회 (물타기 횟수)
	 * averageDownRate : 0.01 = 1% (현재 평단 기준 물타기 비율)
	 */
	od_type = 'limit'; // market or limit
	od_gap = 0;
	od_amount_rate = 0.1;
	od_amount = (usdtBalance * od_amount_rate) / (curruntPrice / currentLeverage);
	// od_sl_rate = 0.02;
	// od_ts_rate = 10;
	// od_ts_trigger_rate = 3;
	od_leverage = 10;
	od_stop_time = 5;
	limitAverageDown = 2;
	// averageDownRate = 0.03;

	if (currentLeverage !== od_leverage) {
		setLeverage(od_leverage);
	}

	// test - 포지션 오픈 후 트래킹 중에 익절가 도달시 트레일링 스탑 발동하면서 뭔가 문제가 생기는 것으로 보임
	od_side = 'buy';
	od_price = curruntPrice - od_gap;
	od_sl_rate = 0.005;
	od_ts_rate = 5;
	od_ts_trigger_rate = 0.05;
	averageDownRate = 0.001;
	openPosition();
};

async function init() {
	// orderSetting('limit', 0, 0.1, 0.005, 5, 80, 5, 1, 2, 0.003)
	clearTimeout(timer);
	await orderSetting();
	// await signalMonitoring();
}

init();

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
