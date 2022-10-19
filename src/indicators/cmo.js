// CMO (chande momentum oscillator)
/**
 * 공식 참고
 * https://planetcalc.com/617/ (상단 수식 위에 본문)
 * https://www.motivewave.com/studies/chande_momentum_oscillator.htm (하단 코드)
 * 트레이딩뷰 > 헬프센터 > relative volatility index
 */
exports.CMO = (datas, length = 7) => {
	// 최근 8개 종가 데이터
	const closeDatas = datas.slice(-length - 1).map((data) => data[data.length - 2]);

	// 각 캔들 종가의 차이값
	let diffArr = [];

	for (let i = 1; i < closeDatas.length; i++) {
		const prev = closeDatas[closeDatas.length - (i + 1)];
		const curr = closeDatas[closeDatas.length - i];
		diffArr.push(curr - prev);
	}

	//차이값의 가장 높은 값의 합계(양수)
	const highSum = diffArr.reduce((acc, curr) => {
		const high = curr >= 0.0 ? curr : 0.0;
		return (acc += high);
	}, 0);

	// 차이값의 가장 낮은 값의 합계(음수)
	const lowSum = diffArr.reduce((acc, curr) => {
		const low = curr >= 0.0 ? 0.0 : Math.abs(curr);
		return (acc += low);
	}, 0);

	// 결과
	const cmo = 100 * ((highSum - lowSum) / (highSum + lowSum));
	return cmo.toFixed(2);
};
