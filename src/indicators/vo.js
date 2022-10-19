// VO (volume oscillator)
/**
 * 트레이딩뷰 > vo지표 코드 보기(파인스크립트 해석)
 * EMA 구하는 법 구글링
 * 특이사항 : fetchOHLCV에 limit제한을 걸어버리면 비교 데이터가 적어서 그런지 수치가 다르게 나옴
 */
exports.VO = (datas, shortLength = 7, longLength = 14) => {
	// 최근 볼륨 데이터
	const volumeDatas = datas.map((data) => data[data.length - 1]);

	const shortAlpha = 2 / (shortLength + 1);
	const longAlpha = 2 / (longLength + 1);

	// EMA = alpha * currntVolume + (1 - alpha) * prevEMA;
	// 과거 데이터가 0번째 순으로
	const EMACalc = (volumes, alpha) => {
		let emaArray = [volumes[0]];
		for (let i = 1; i < volumes.length; i++) {
			emaArray.push(alpha * volumes[i] + (1 - alpha) * emaArray[i - 1]);
		}
		return emaArray[emaArray.length - 1];
	};

	const shortEMA = EMACalc(volumeDatas, shortAlpha);
	const longEMA = EMACalc(volumeDatas, longAlpha);

	// vo
	const vo = ((shortEMA - longEMA) / longEMA) * 100;
	return vo.toFixed(2);
};
