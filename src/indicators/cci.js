// CCI (commodity channel index)
/**
 * 트레이딩뷰 > cci 지표 코드 보기(파인스크립트 해석)
 */
const { SMACalc } = require('./calc/sma');
const { DEVCalc } = require('./calc/dev');

exports.CCI = (datas, length = 20) => {
	const priceDatas = datas.map((data) => (data[2] + data[3] + data[4]) / 3).slice(-length);
	const sma = SMACalc(priceDatas, length);
	const dev = DEVCalc(priceDatas, length);
	const cci = (priceDatas[priceDatas.length - 1] - sma) / (0.015 * dev);

	return cci.toFixed(2);
};
