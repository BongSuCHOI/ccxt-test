// -Calculation ================================================================================= //
// O = open, H = high, L = low, C = close
// bull = ta.ema(H - ta.ema(C, length), smooth)
// bear = ta.ema(L - ta.ema(C, length), smooth)
// bbp  = ta.ema(bull + bear, smooth)
const { EMACalc } = require('./calc/ema');

exports.BAB = (datas, length = 7, smooth = 1) => {
	const highDatas = datas.map((data) => data[2]);
	const lowDatas = datas.map((data) => data[3]);
	const closeDatas = datas.map((data) => data[4]);

	const closeEMAs = EMACalc(closeDatas, length);

	const bulls = EMACalc(
		closeEMAs.map((ema, i) => highDatas[i] - ema),
		smooth
	);

	const bears = EMACalc(
		closeEMAs.map((ema, i) => lowDatas[i] - ema),
		smooth
	);

	const res = EMACalc(
		bulls.map((bull, i) => bull + bears[i]),
		smooth
	);

	return res[res.length - 1].toFixed(2);
};
