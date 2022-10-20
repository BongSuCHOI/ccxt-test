// 편차 (deviation)
/**
 * 트레이딩뷰 > pine script 언어 레퍼런스 메뉴얼 v5 > ta.dev 코드 보기(파인스크립트 해석)
 */
const { SMACalc } = require('./sma');

exports.DEVCalc = (datas, length) => {
	const mean = SMACalc(datas, length);
	let sum = 0;

	for (let i = 0; i < datas.length; i++) {
		sum = sum + Math.abs(datas[i] - mean);
	}

	return sum / length;
};
