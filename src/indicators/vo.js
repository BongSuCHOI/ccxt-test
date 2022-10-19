// VO (volume oscillator)
/**
 * 트레이딩뷰 > vo지표 코드 보기(파인스크립트 해석)
 * EMA 구하는 법 구글링
 * 특이사항 : fetchOHLCV에 limit제한을 걸어버리면 비교 데이터가 적어서 그런지 수치가 다르게 나옴
 */
const { EMACalc } = require('./calc/ema');

exports.VO = (datas, shortLength = 7, longLength = 14) => {
	// 최근 볼륨 데이터
	const volumeDatas = datas.map((data) => data[5]);

	const shortEMA = EMACalc(volumeDatas, shortLength);
	const longEMA = EMACalc(volumeDatas, longLength);

	// vo
	const vo = ((shortEMA - longEMA) / longEMA) * 100;
	return vo.toFixed(2);
};
