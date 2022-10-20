// 심플 무빙 애버리지 (simple moving average)
/**
 * 트레이딩뷰 > pine script 언어 레퍼런스 메뉴얼 v5 > ta.sma 코드 보기(파인스크립트 해석)
 */
exports.SMACalc = (datas, length) => datas.reduce((acc, curr) => (acc += curr), 0) / length;
