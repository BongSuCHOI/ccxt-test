const dotenv = require('dotenv');
const express = require('express');
const app = express().use(express.json());
const server = require('http').createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);
const ccxt = require('ccxt');
const { indicator } = require('./src/indicators/index');

// Setup
dotenv.config();
const PORT = process.env.PORT;

// Connect html, js
app.get('/', (req, res) => {
	res.sendFile(__dirname + '/src/index.html');
});
app.use(express.static('src'));

server.listen(PORT, () => {
	console.log(`🚀 Server running on port ${PORT}`);
});

// socket.io test
io.on('connection', async (socket) => {
	console.log('소켓 연결 성공!');

	// current seed
	const currSeed = await getBalances();
	io.emit('seed', currSeed);

	// trading start
	socket.on('trading start', (bool) => {
		if (bool) {
			tradingStart();
		}
	});

	// trading stop
	socket.on('trading stop', (bool) => {
		if (bool) {
			// tradingStart();
		}
	});
});

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

//
// === Custom exchange trade methods ===
//

// order config
let od_type = 'limit';
let od_side = 'buy';
let od_amount; // orderSetting()에서 계산
let od_amount_rate = 0.1;
let od_price; // 오더 생성시 od_gap과 closePrice로 계산
let od_gap = 0;
let od_sl_rate = 0;
let od_ts_rate = 0;
let od_ts_trigger_rate = 0;
let od_leverage = 1;
let od_stop_time = 10;
let limitAverageDown = 0;
let averageDownRate = 0.03;
let averageDownCount = 0;
let lastTradeDirection = '';
let activeAGDOrderId = '';
let timer;

// Get balances from the exchange
const getBalances = async () => {
	const balance = await exchange.fetchBalance();
	const usdtBalance = Math.round(balance.free.USDT);
	return usdtBalance;
};

// Get last price
const getLastPrice = async () => {
	const ticker = await exchange.fetchTicker(TICKER);
	const latPrice = ticker.last;
	return latPrice;
};

// Get ticker positions
const getPositions = async () => {
	const position = await exchange.fetchPositions([TICKER]);
	const longEntryPrice = Number(position[0].info.entry_price);
	const shortEntryPrice = Number(position[1].info.entry_price);
	const longAmount = Number(position[0].contracts);
	const shortAmount = Number(position[1].contracts);
	const entryLeverage = Number(position[0].info.leverage);
	return {
		longEntryPrice,
		shortEntryPrice,
		longAmount,
		shortAmount,
		entryLeverage,
	};
};

// Set leverage
const setLeverage = async (leverage) => {
	await exchange.setLeverage(leverage, TICKER);
};

// Trading stop time
const tradingStopTime = () => {
	console.log(`${od_stop_time}분 거래 중지 시작`);
	const ms = od_stop_time * 60 * 1000;
	let recursive_timer;

	timer = setTimeout(async function checkStop() {
		const { longAmount, shortAmount } = await getPositions();

		if (
			(lastTradeDirection === 'buy' && longAmount === 0) ||
			(lastTradeDirection === 'sell' && shortAmount === 0)
		) {
			console.log(`${od_stop_time}분이 지나서 다시 거래를 시작합니다`);
			clearTimeout(recursive_timer);
			tradingStart();
		} else {
			console.log(`포지션이 남아있어서 다시 ${od_stop_time}분간 거래 중지`);
			recursive_timer = setTimeout(checkStop, ms);
		}
	}, ms);
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
	console.log('트레일링 스탑 시작');
};

// Average down
const averageDown = async (price) => {
	averageDownCount += 1;
	console.log(`물타기 ${averageDownCount}회`);
	await openPosition(true);
	if (activeAGDOrderId.length > 0) {
		await cancelOrder(activeAGDOrderId, TICKER);
	}
	while (true) {
		if (await checkIfLimitOrderFilled()) {
			await closePosition(price, 'adg');
			await tickerMonitoring();
			break;
		}
	}
};

// Ticker monitoring
const tickerMonitoring = async () => {
	// currunt position info
	const { longEntryPrice, shortEntryPrice } = await getPositions();
	const averagePrice = lastTradeDirection === 'buy' ? longEntryPrice : shortEntryPrice;
	const ts_triggerPrice =
		lastTradeDirection === 'buy'
			? averagePrice + Math.round(averagePrice * (od_ts_trigger_rate * 0.001))
			: averagePrice - Math.round(averagePrice * (od_ts_trigger_rate * 0.001));
	const sl_TriggerPrice =
		lastTradeDirection === 'buy'
			? averagePrice - Math.round(averagePrice * od_sl_rate)
			: averagePrice + Math.round(averagePrice * od_sl_rate);
	const averageDownPrice =
		lastTradeDirection === 'buy'
			? averagePrice - Math.round(averagePrice * averageDownRate)
			: averagePrice + Math.round(averagePrice * averageDownRate);

	console.log('현재 평단 :', averagePrice);
	console.log('물타기 가격 :', averageDownPrice);
	console.log('손절 가격 :', sl_TriggerPrice);
	console.log('TS 발동 가격 :', ts_triggerPrice);
	console.log('------------------------------------');

	// bybit-testnet 초당 20회
	while (true) {
		const lastPrice = await getLastPrice();

		// average down (현재가격 <= 트리거 가격 && 물타기 카운트 횟수 < 물타기 제한 횟수)
		if (lastPrice <= averageDownPrice && averageDownCount < limitAverageDown) {
			const halfClosePrice =
				lastTradeDirection === 'buy' ? averagePrice + 3 : averagePrice - 3;
			od_price = lastTradeDirection === 'buy' ? lastPrice - 3 : lastPrice + 3;
			await averageDown(halfClosePrice);
			break;
		}

		// stop loss (물타기 카운트 횟수 == 물타기 제한 횟수)
		if (averageDownCount == limitAverageDown) {
			console.log('물타기 최대 횟수 도달. SL 주문 생성. 실시간 조회 종료');
			await closePosition(sl_TriggerPrice, 'sl');
			tradingStopTime();
			break;
		}

		// trigger stop (현재가격 >= 트리거 가격)
		if (lastPrice >= ts_triggerPrice) {
			console.log('익절가 도달. 실시간 조회 종료');
			const closePrice = lastTradeDirection === 'buy' ? lastPrice - 0.5 : lastPrice + 0.5;
			await closePosition(closePrice);
			await trailingStop();
			tradingStopTime();
			break;
		}
	}
};

// Trade signal monitoring
const signalMonitoring = async () => {
	// bybit-testnet 초당 20회
	while (true) {
		const OHLCVdatas = await exchange.fetchOHLCV('BTC/USDT:USDT', '5m');
		const exceptCurrDatas = OHLCVdatas.slice(0, OHLCVdatas.length - 1);
		const CCI = indicator.CCI(exceptCurrDatas, 20);
		const SLOW_STOCH = indicator.SLOW_STOCH(exceptCurrDatas, 14, 85, 15, 3, 3);

		// socket
		io.emit('indicator', { CCI, SLOW_STOCH });

		// long
		if (SLOW_STOCH.goldCross && SLOW_STOCH.OverSold && CCI < -125) {
			const lastPrice = OHLCVdatas[OHLCVdatas.length - 1][4];
			od_side = 'buy';
			od_price = lastPrice - od_gap;
			await openPosition();
			io.emit('buy signal history', { CCI, SLOW_STOCH, SIDE: 'BUY', DATE: new Date() });
			break;
		}

		// short
		if (SLOW_STOCH.deadCross && SLOW_STOCH.OverBought && CCI > 125) {
			const lastPrice = OHLCVdatas[OHLCVdatas.length - 1][4];
			od_side = 'sell';
			od_price = lastPrice + od_gap;
			await openPosition();
			io.emit('sell signal history', { CCI, SLOW_STOCH, SIDE: 'SELL', DATE: new Date() });
			break;
		}
	}
};

// Check if limit order filled
const checkIfLimitOrderFilled = async () => {
	// 이거 도는 도중에 익절가 도달하거나 손절가 도달하면 주문 넣는 로직 추가.
	// 지금은 그냥 하염없이 익절가 넘어도 체크함
	const orders = await exchange.fetchOpenOrders(TICKER);
	return orders.length === 0;
};

// Cancel order
const cancelOrder = async (orderId) => {
	console.log('이전 순환매(평단에서 추가 진입 수량 정리)주문 취소');
	const openOrders = await exchange.fetchOpenOrders(TICKER);
	const isOpenOrder = openOrders.filter((order) => order.id === orderId);
	if (isOpenOrder.length > 0) {
		await exchange.cancelOrder(orderId, TICKER);
	}
	activeAGDOrderId = '';
};

// Create open Position
const openPosition = async (isAverageDown = false) => {
	// 포지션이 열리고 15분가량 체결이 안되면 처음부터 다시 시작
	lastTradeDirection = od_side;
	console.log(`포지션 오픈 : ${od_side} | 가격 : ${od_price} | 수량 : ${od_amount}`);
	const order = await exchange.createOrder(TICKER, od_type, od_side, od_amount, od_price);

	while (!isAverageDown) {
		if (await checkIfLimitOrderFilled()) {
			await tickerMonitoring();
			break;
		}
	}
};

// Create clode position
const closePosition = async (trigger, type) => {
	const { longAmount, shortAmount } = await getPositions();
	const closeSide = lastTradeDirection === 'buy' ? 'sell' : 'buy';
	let amount = lastTradeDirection === 'buy' ? longAmount : shortAmount;
	let price = trigger;

	if (type !== 'sl') {
		amount = amount / 2;
	}

	const order = await exchange.createOrder(TICKER, od_type, closeSide, amount, price, {
		reduceOnly: true,
	});

	if (type === 'adg') {
		activeAGDOrderId = order.id;
	}

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
	const lastPrice = await getLastPrice();
	const usdtBalance = await getBalances();
	const { entryLeverage } = await getPositions();

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
	od_amount_rate = 0.01;
	od_amount = (usdtBalance * od_amount_rate) / (lastPrice / entryLeverage);
	// od_sl_rate = 0.02;
	// od_ts_rate = 10;
	// od_ts_trigger_rate = 3;
	od_leverage = 10;
	od_stop_time = 5;
	limitAverageDown = 2;
	// averageDownRate = 0.03;

	if (entryLeverage != od_leverage) {
		await setLeverage(od_leverage);
	}

	// test
	od_side = 'sell';
	od_price = lastPrice - od_gap;
	od_sl_rate = 0.0001;
	od_ts_rate = 1;
	od_ts_trigger_rate = 0.1;
	averageDownRate = 0.00005;
	await openPosition();
};

async function tradingStart() {
	console.log('tradingStart!');
	averageDownCount = 0;
	activeAGDOrderId = '';
	clearTimeout(timer);
	await orderSetting();
	// await signalMonitoring();
}

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
