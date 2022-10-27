// 스토캐스틱 슬로우 (stochastic slow)
/**
 * 트레이딩뷰 > stochastic 지표 코드 보기(파인스크립트 해석)
 */
const { SMACalc } = require('./calc/sma');
const { STOCHcalc } = require('./calc/stoch');

exports.SLOW_STOCH = (datas, length = 14, bought = 80, sold = 20, smoothK = 3, smoothD = 3) => {
	/**
	 * datas = 캔들 정보 배열 (fetchOHLCV() 리턴값)
	 * len = 캔들 갯수
	 * n = 뒤에서(최신 데이터)부터 자를 길이
	 * ex) datas = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; len = 5; n = 2;
	 * res) return = [4, 5, 6, 7, 8]
	 */
	const getStoch = (datas, len, n) => {
		const sliceDatas = datas.slice(-len - n, datas.length - n);
		const highs = sliceDatas.map((data) => data[2]);
		const lows = sliceDatas.map((data) => data[3]);
		const closes = sliceDatas.map((data) => data[4]);
		return STOCHcalc(highs, lows, closes, len);
	};

	/**
	 * n = 최신 데이터부터 몇개 뽑을지 (n = 1 ? 최신 데이터 k + 이전 데이터 k)
	 * return되는 k는 총 3개.
	 * ex) n = 0 ? return = [1, 2, 3] : n = 1 ? return = [2, 3, 4]
	 * 현재 d를 뽑기 위해선 현재 k와 이전 k 합쳐서 3개가 필요.
	 * 반대로 이전 d를 뽑기 위해선 이전 k와 더 이전 k 합쳐서 3개가 필요.
	 */
	const getK = (n) => {
		const kArr = [];

		for (let i = n; i < smoothD + n; i++) {
			const stochArr = [];

			for (let j = i; j < smoothK + i; j++) {
				const stoch = getStoch(datas, length, j);
				stochArr.push(stoch);
			}

			kArr.push(SMACalc(stochArr, smoothK));
		}

		return kArr;
	};

	// 현재 k 값 (smoothD의 숫자만큼)
	const currKArr = getK(0);

	// 이전 k 값 (smoothD의 숫자만큼)
	const prevKArr = getK(1);

	const currK = currKArr[0];
	const prevK = prevKArr[0];
	const currD = SMACalc(currKArr, smoothD);
	const prevD = SMACalc(prevKArr, smoothD);

	let goldCross = false;
	let deadCross = false;
	let OverSold = false;
	let OverBought = false;

	// gold cross (currK > currD && prevK < prevD)
	if (currK > currD && prevK < prevD) {
		goldCross = true;
	}

	// dead cross (currK < currD && prevK > prevD)
	if (currK < currD && prevK > prevD) {
		deadCross = true;
	}

	// over sold
	if (currK < sold) {
		OverSold = true;
	}

	// over bought
	if (currK > bought) {
		OverBought = true;
	}

	// return { currK, prevK, currD, prevD };
	return { currK, currD, goldCross, deadCross, OverSold, OverBought };
};
