// EMA = alpha * currntVolume + (1 - alpha) * prevEMA;
// 과거 데이터가 0번째 순으로

exports.EMACalc = (volumes, length) => {
	const alpha = 2 / (length + 1);
	let emaArray = [volumes[0]];
	for (let i = 1; i < volumes.length; i++) {
		emaArray.push(alpha * volumes[i] + (1 - alpha) * emaArray[i - 1]);
	}
	return emaArray;
};
