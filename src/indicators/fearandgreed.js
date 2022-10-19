// 변동성 (잠깐 스탑 - cmo/vo/rvi 먼저 구해서 로직 짜보고 이어서)
const volatility = async () => {
	// 공포 환의 계산 공식 사이트
	// https://alternative.me/crypto/fear-and-greed-index/
	// https://zipmex.com/learn/crypto-fear-and-greed-index-explained/

	// 현재 시간부터 3시간 전 까지 캔들 데이터
	const a = await exchange.fetchOHLCV('BTC/USDT:USDT', '1m');
	console.log(a[a.length - 1]);
	// [타임스탬프, 시가, 고가, 저가, 종가, 거래량];
	// 저 마지막 volum이 정확히 어떤건지 ccxt wiki 찾아봐야 할듯
	const b1 = 19932;
	const b2 = 19925;
	const b3 = 19908;
	const b4 = 19914;
	const b5 = 19895;

	// const ln1 = Math.log(b2 / b1);
	// const ln2 = Math.log(b3 / b2);
	// const ln3 = Math.log(b4 / b3);
	// const ln4 = Math.log(b5 / b4);

	// 표준 편차
	function standardDeviation(arr) {
		let mean =
			arr.reduce((acc, curr) => {
				return acc + curr;
			}, 0) / arr.length;

		arr = arr.map((el) => {
			return (el - mean) ** 2;
		});

		let total = arr.reduce((acc, curr) => acc + curr, 0);

		return Math.sqrt(total / arr.length);
	}

	console.log(standardDeviation([b1, b2, b3, b4, b5]) * Math.sqrt(5));
};
