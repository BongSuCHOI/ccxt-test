// 표준 편차
// https://sciencing.com/calculate-deviations-mean-sum-squares-5691381.html
const { SMACalc } = require('./sma');

exports.STDEVCalc = (datas, length) => {
	const sma = SMACalc(datas, length);
	const mean = datas.map((data) => data - sma);
	const stdevArr = [];
	let sumOfSquareDeviations = 0;

	for (let i = 0; i < mean.length; i++) {
		sumOfSquareDeviations = sumOfSquareDeviations + mean[i] * mean[i];
		stdevArr.push(Math.sqrt(sumOfSquareDeviations / length));
	}

	return stdevArr[stdevArr.length - 1];
};
