// 표준 편차
// https://sciencing.com/calculate-deviations-mean-sum-squares-5691381.html
exports.STDEVCalc = (arr, length) => {
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
