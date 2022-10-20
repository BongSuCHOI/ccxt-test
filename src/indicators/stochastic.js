// 스토캐스틱 슬로우 (stochastic slow)
/**
 * 트레이딩뷰 > stochastic 지표 코드 보기(파인스크립트 해석)
 */
const { SMACalc } = require('./calc/sma');
const { STOCHcalc } = require('./calc/stoch');

exports.SLOW_STOCH = (
	datas,
	length = 14,
	overBuy = 80,
	overSell = 20,
	smoothK = 3,
	smoothD = 3
) => {
	const stochArr = [];

	for (let i = 0; i < smoothK; i++) {
		const sliceDatas = datas.slice(-length - i, datas.length - i);
		const highDatas = sliceDatas.map((data) => data[2]);
		const lowDatas = sliceDatas.map((data) => data[3]);
		const closeDatas = sliceDatas.map((data) => data[4]);
		const stoch = STOCHcalc(highDatas, lowDatas, closeDatas, length);
		stochArr.push(stoch);
	}

	const k = SMACalc([stochArr], smoothK);
	// D부터 꼬였는데 아래처럼 D도 k의 이전 3개 값 구해서 하면 될 듯..?
	const d = SMACalc([79.49, 84.99, 92.94], smoothD);
	console.log(k, d);
};
