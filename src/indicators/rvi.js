// RVI (relative volatility index)
/**
 * 트레이딩뷰 > riv 지표 코드 보기(파인스크립트 해석)
 * https://www.hi-ib.com/upload/systemtrade/guide/RVI.pdf
 * marketvolume.com/technicalanalysis/relativevolatilityindex.asp
 */
exports.RVI = (datas, length = 7) => {
	// 최근 종가 데이터
	const closeDatas = datas.map((data) => data[data.length - 2]);
	const upperSTDs = [];
	const lowerSTDs = [];
	let stdevArr = [];

	// 표준 편차
	// https://sciencing.com/calculate-deviations-mean-sum-squares-5691381.html
	const standardDeviation = (arr, length) => {
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

	// length 단위로 closeDatas slice후 표준 편차
	// ex) closeDatas = [1, 3, 5, 10, 30]
	// ex) slide = [1,3,5], [3,5,10], [5,10,30]
	// ex) stdevArr = [1.63, 2.94, 10.8]
	for (let i = 0; i < closeDatas.length - (length - 1); i++) {
		const sliceDatas = closeDatas.slice(i, length + i);
		stdevArr.push(standardDeviation(sliceDatas, length));
	}

	// upperSTDs = 현재가격 - 이전종가가 0보다 큰 경우 표준편차 / 최신 데이터가 0번째
	// lowerSTDs = 현재가격 - 이전종가가 0보다 작은 경우 표준편차 / 최신 데이터가 0번째
	for (let i = 0; i < stdevArr.length; i++) {
		const prev = closeDatas[closeDatas.length - (i + 2)];
		const curr = closeDatas[closeDatas.length - (i + 1)];
		upperSTDs.push(curr - prev <= 0 ? 0 : stdevArr[stdevArr.length - (i + 1)]);
		lowerSTDs.push(curr - prev > 0 ? 0 : stdevArr[stdevArr.length - (i + 1)]);
	}

	// EMA = alpha * currntVolume + (1 - alpha) * prevEMA;
	// 과거 데이터가 0번째 순으로
	const EMACalc = (volumes, length = 14) => {
		const alpha = 2 / (length + 1);
		let emaArray = [volumes[0]];
		for (let i = 1; i < volumes.length; i++) {
			emaArray.push(alpha * volumes[i] + (1 - alpha) * emaArray[i - 1]);
		}
		return emaArray[emaArray.length - 1];
	};

	const upperEMA = EMACalc(upperSTDs.slice().reverse());
	const lowerEMA = EMACalc(lowerSTDs.slice().reverse());

	// 결과
	const rvi = (upperEMA / (upperEMA + lowerEMA)) * 100;
	return rvi.toFixed(2);
};
