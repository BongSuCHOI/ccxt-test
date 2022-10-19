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
// 		// executeTrade(json);
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

async function init() {
	// executeTrade();
	const OHLCVdatas = await exchange.fetchOHLCV('BTC/USDT:USDT', '5m');
	const RVI = indicator.RVI(OHLCVdatas);
	const VO = indicator.VO(OHLCVdatas);
	const CMO = indicator.CMO(OHLCVdatas);
	console.log('rvi :', RVI);
	console.log('vo :', VO);
	/**
	 * 아래 api들 합칠 수 있으면 합치자
	 * fetchPositions = 2개
	 * fetchTicker = 2개
	 */
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
