const socket = io();

socket.on('seed', (seed) => {
	const seedBox = document.querySelector('#seed-box .curr-seed .usd');
	seedBox.innerHTML = seed;
});

const tradeStartBtn = document.querySelector('.trade-start-btn');
tradeStartBtn.addEventListener('click', () => {
	socket.emit('trading start', true);
});

socket.on('indicator', ({ CCI, SLOW_STOCH }) => {
	const cciBox = document.querySelector('#live-indicator-box .cci');
	const kBox = document.querySelector('#live-indicator-box .stochastic-k');
	const dBox = document.querySelector('#live-indicator-box .stochastic-d');
	const crossBox = document.querySelector('#live-indicator-box .stochastic-cross');
	const { currK, currD, goldCross } = SLOW_STOCH;
	const cross = goldCross ? 'GOLD' : 'DEAD';

	cciBox.innerHTML = CCI;
	kBox.innerHTML = currK.toFixed(2);
	dBox.innerHTML = currD.toFixed(2);
	crossBox.innerHTML = cross;
});
