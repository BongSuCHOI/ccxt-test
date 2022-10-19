/**
 * 트레이딩뷰 > 'Bull vs Bear Power by DGT by dgtrd' 스크립트 코드 보기(파인스크립트 해석)
 */
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
