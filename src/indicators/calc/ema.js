// EMA = alpha * currntVolume + (1 - alpha) * prevEMA;
// 과거 데이터가 0번째 순으로

exports.EMACalc = (datas, length) => {
	const alpha = 2 / (length + 1);
	let emaArray = [datas[0]];
	for (let i = 1; i < datas.length; i++) {
		emaArray.push(alpha * datas[i] + (1 - alpha) * emaArray[i - 1]);
	}
	return emaArray;
};
