const test = async () => {
	const res = await fetch('https://1e0d-14-39-88-52.jp.ngrok.io/asd');
	const data = await res.text();
	console.log(data);
};

test().then((res) => console.log(res));
