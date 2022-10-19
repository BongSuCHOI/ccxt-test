// RVI (relative volatility index)
/**
 * 트레이딩뷰 > riv 지표 코드 보기(파인스크립트 해석)
 * https://www.hi-ib.com/upload/systemtrade/guide/RVI.pdf
 * marketvolume.com/technicalanalysis/relativevolatilityindex.asp
 */
const { EMACalc } = require('./calc/ema');
const { STDEVCalc } = require('./calc/stdev');

exports.RVI = (datas, length = 7) => {
	// 최근 종가 데이터
	const closeDatas = datas.map((data) => data[4]);
	const upperSTDs = [];
	const lowerSTDs = [];
	let stdevArr = [];

	// length 단위로 closeDatas slice후 표준 편차
	// ex) closeDatas = [1, 3, 5, 10, 30]
	// ex) slide = [1,3,5], [3,5,10], [5,10,30]
	// ex) stdevArr = [1.63, 2.94, 10.8]
	for (let i = 0; i < closeDatas.length - (length - 1); i++) {
		const sliceDatas = closeDatas.slice(i, length + i);
		stdevArr.push(STDEVCalc(sliceDatas, length));
	}

	// upperSTDs = 현재가격 - 이전종가가 0보다 큰 경우 표준편차 / 최신 데이터가 0번째
	// lowerSTDs = 현재가격 - 이전종가가 0보다 작은 경우 표준편차 / 최신 데이터가 0번째
	for (let i = 0; i < stdevArr.length; i++) {
		const prev = closeDatas[closeDatas.length - (i + 2)];
		const curr = closeDatas[closeDatas.length - (i + 1)];
		upperSTDs.push(curr - prev <= 0 ? 0 : stdevArr[stdevArr.length - (i + 1)]);
		lowerSTDs.push(curr - prev > 0 ? 0 : stdevArr[stdevArr.length - (i + 1)]);
	}

	const upperEMA = EMACalc(upperSTDs.slice().reverse(), 14);
	const lowerEMA = EMACalc(lowerSTDs.slice().reverse(), 14);

	// 결과
	const rvi = (upperEMA / (upperEMA + lowerEMA)) * 100;
	return rvi.toFixed(2);
};
