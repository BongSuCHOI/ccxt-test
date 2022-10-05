const express = require('express');
const bodyParser = require('body-parser');
const ccxt = require('ccxt');
const dotenv = require('dotenv');

//
// === Setup, config, and exchange initialization ===
//

// Use .env file for private keys
dotenv.config();

// Start app with bodyParser
const app = express().use(bodyParser.json());
const PORT = process.env.PORT;

app.get('/', (req, res) => {
	res.sendFile(__dirname + '/src/index.html');
});

app.use(express.static('src'));

app.listen(PORT, () => {
	console.log(`🚀 Server running on port ${PORT}`);
});

// Ensure all TradingView webhooks contain the AUTH_ID to authorize trades to be made
const AUTH_ID = process.env.AUTH_ID;

// Set the exchange according to the CCXT ID https://github.com/ccxt/ccxt/wiki/Manual
const EXCHANGE = process.env.EXCHANGE;
const TICKER = process.env.TICKER;
const TEST_MODE = process.env.TEST_MODE == 'false' ? false : true;
const TESTNET_API_KEY = process.env.TESTNET_API_KEY;
const TESTNET_API_SECRET = process.env.TESTNET_API_SECRET;
const LIVE_API_KEY = process.env.API_KEY;
const LIVE_API_SECRET = process.env.API_SECRET;
const apiKey = TEST_MODE ? TESTNET_API_KEY : LIVE_API_KEY;
const apiSecret = TEST_MODE ? TESTNET_API_SECRET : LIVE_API_SECRET;

// Instantiate the exchange
const exchange = new ccxt[EXCHANGE]({
	apiKey: apiKey,
	secret: apiSecret,
});

// Handle authentication in test mode
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
// === Webhooks ===
//

let tdata;

app.get('/asd', (req, res) => {
	res.json(tdata);
});

// Catch the webhook and handle the trade
app.post('/webhook', (req, res) => {
	handleTrade(req, res);
});

// For testing the JSON body
app.post('/test', (req, res) => {
	// console.log(req.body);
});

// Checks first to see if the webhook carries a valid safety ID
const handleTrade = (req, res) => {
	let json = req.body;
	if (json.auth_id === AUTH_ID) {
		// getBalances();
		res.status(200).end();
	} else {
		console.log('401 UNAUTHORIZED', json);
		res.status(401).end();
	}
};

//
// === Custom exchange methods ===
//

// ByBit's trailing stop losses can only be set on open positions
const setBybitTslp = async (lastTradeDirection, trailingStopLossTarget) => {
	if (trailingStopLossTarget && EXCHANGE == 'bybit') {
		console.log('setting TSLP after retracement of', trailingStopLossTarget + '...');
		if (usingBybitUSDT) {
			let side =
				lastTradeDirection == 'short'
					? 'Sell'
					: lastTradeDirection == 'long'
					? 'Buy'
					: undefined;
			if (side) {
				try {
					await exchange.private_linear_post_position_trading_stop({
						// Since we're hitting bybit's API directly, this is a specific endpoint for USDT pairs
						symbol: TICKER,
						side: side,
						trailing_stop: Math.round(trailingStopLossTarget * 100) / 100,
					});
				} catch {
					return console.log('ERROR SETTING TSLP, MAYBE NO OPEN POSITION?');
				}
			}
		} else {
			try {
				await exchange.v2_private_post_position_trading_stop({
					// Since we're hitting bybit's API directly, this is a specific endpoint for inverse pairs
					symbol: TICKER,
					trailing_stop: Math.round(trailingStopLossTarget * 100) / 100,
				});
			} catch {
				return console.log('ERROR SETTING TSLP, MAYBE NO OPEN POSITION?');
			}
		}
	} else {
		return;
	}
};

//
// === Trade execution ===
//

// Retrieve balances from the exchange
const getBalances = async () => {
	exchange['options']['defaultType'] = 'future';
	await exchange.loadMarkets();

	let balances = await exchange.fetchBalance();
	let tickerDetails = await exchange.fetchTicker(TICKER);

	// 시장가 주문
	const type = 'MARKET';
	const opneSide = 'buy';
	const closeSide = 'sell';
	const amount = 0.1;
	const price = undefined;
	const closePositionParms = { reduceOnly: true };
	// const createOrder = await exchange.createOrder(TICKER, type, opneSide, amount, price);
	// console.log('Created order id:', createOrder['id']);

	// 현재 포지션 종료 (현재 방향 반대로 reduce 주문을 열어서 정리)
	// const closePositionOrder = await exchange.createOrder(
	// 	TICKER,
	// 	type,
	// 	closeSide,
	// 	amount,
	// 	price,
	// 	closePositionParms
	// );

	// 트레일링 스탑 (바이낸스)
	// const trailingParams = {
	// 	activationPrice: '20150',
	// 	callbackRate: '0.5',
	// };
	// const trailing_response = await exchange.createOrder(
	// 	TICKER,
	// 	'TRAILING_STOP_MARKET',
	// 	closeSide,
	// 	amount,
	// 	price,
	// 	trailingParams
	// );

	// 트레일링 스탑 (바이비트)
	// const trailingParams = {
	// 	symbol: TICKER,
	// 	side: openSide,
	// 	trailing_stop: 30,
	// };
	// const trailing_response = await exchange.privatePostPrivateLinearPositionTradingStop(
	// 	trailingParams
	// );
};

getBalances();
