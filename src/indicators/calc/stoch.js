// 스토캐스틱 슬로우 (stochastic)
/**
 * 트레이딩뷰 > pine script 언어 레퍼런스 메뉴얼 v5 > ta.stoch 코드 보기(파인스크립트 해석)
 */
const { SMACalc } = require('./sma');

exports.STOCHcalc = (highDatas, lowDatas, closeDatas, length) => {
	const highest = Math.max(...highDatas.slice(-length));
	const lowest = Math.min(...lowDatas.slice(-length));
	const stoch = (100 * (closeDatas[closeDatas.length - 1] - lowest)) / (highest - lowest);
	return stoch;
};
