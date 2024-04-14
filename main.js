function get_cookie(name) {
	const key_value = document.cookie
		.split('; ')
		.find((row) => row.startsWith(`${name}=`));
	if (null == key_value) return '';
	return key_value.split('=').slice(1).join('=');
}

const ANYCAST_ORIGIN = get_cookie('ANYCAST_ORIGIN');

document.querySelector('#anycast-origin').textContent = ANYCAST_ORIGIN;

let api_base = location.href;

const ROUTER_APIS = new Map;
ROUTER_APIS.set('rc140', 'https://api-c.looking-glass.nc.menhera.org/');
ROUTER_APIS.set('rt132', 'https://api-t.looking-glass.nc.menhera.org/');

function get_api_base(router_id) {
	const base = ROUTER_APIS.get(router_id);
	if (null == base) {
		return ROUTER_APIS.get('rt132');
	}
	return base;
}

const location_select = document.querySelector('#location');
location_select.addEventListener('change', (ev) => {
	api_base = get_api_base(location_select.value);
});

api_base = get_api_base(location_select.value);

(async () => {
	const elements = document.querySelectorAll('.reachability-status');
	for (const element of elements) {
		const router_id = element.dataset.routerId;
		if (!router_id) continue;
		const url = get_api_base(router_id);
		try {
			await fetch(url);
			element.classList.add('reachability-success');
			element.textContent = '✅ CONNECTED';
		} catch (e) {
			element.classList.add('reachability-fail');
			element.textContent = '⚠️ FAILED';
		}
	}
})().catch((e) => console.error(e));

async function make_api_request(url) {
	const res = await fetch(url, {
		credentials: 'include',
	});
	return res.json();
}

async function bgp(address) {
	const url = new URL('/api/v1/bgp', api_base);
	url.searchParams.set('address', address);
	return make_api_request(url);
}

async function ping(host) {
	const url = new URL('/api/v1/ping', api_base);
	url.searchParams.set('host', host);
	return make_api_request(url);
}

async function traceroute(host) {
	const url = new URL('/api/v1/traceroute', api_base);
	url.searchParams.set('host', host);
	return make_api_request(url);
}

const error = document.querySelector('#error');
const result = document.querySelector('#results');

function lock_ui() {
	[... document.querySelectorAll('button')].forEach((button) => {
		button.disabled = true;
	});
	result.textContent = '';
	result.appendChild(document.createElement('progress'));
}

function unlock_ui() {
	[... document.querySelectorAll('button')].forEach((button) => {
		button.disabled = false;
	});
	result.textContent = '';
}

const ping_host = document.querySelector('#ping-host');
const traceroute_host = document.querySelector('#traceroute-host');
const bgp_address = document.querySelector('#bgp-address');

document.querySelector('#ping-button').addEventListener('click', () => {
	lock_ui();
	ping(ping_host.value.trim()).then((data) => {
		unlock_ui();
		if (data.error) {
			error.textContent = data.error;
		} else {
			error.textContent = '';
		}
		result.textContent = data.result;
	}).catch((e) => {
		unlock_ui();
		error.textContent = String(e);
		result.textContent = '';
	});
});

document.querySelector('#traceroute-button').addEventListener('click', () => {
	lock_ui();
	traceroute(traceroute_host.value.trim()).then((data) => {
		unlock_ui();
		if (data.error) {
			error.textContent = data.error;
		} else {
			error.textContent = '';
		}
		result.textContent = data.result;
	}).catch((e) => {
		unlock_ui();
		error.textContent = String(e);
		result.textContent = '';
	});
});

document.querySelector('#bgp-button').addEventListener('click', () => {
	lock_ui();
	bgp(bgp_address.value.trim()).then((data) => {
		unlock_ui();
		if (data.error) {
			error.textContent = data.error;
		} else {
			error.textContent = '';
		}
		result.textContent = data.result;
	}).catch((e) => {
		unlock_ui();
		error.textContent = String(e);
		result.textContent = '';
	});
});

const tabs = [... document.querySelectorAll('#tabs > div')];
const panes = [... document.querySelectorAll('#panes > div')];
function select_tab(pane_name) {
	tabs.forEach((tab) => {
		if (pane_name == tab.dataset.paneName) {
			tab.classList.add('selected');
		} else {
			tab.classList.remove('selected');
		}
	});
	panes.forEach((pane) => {
		if (pane_name == pane.dataset.paneName) {
			pane.hidden = false;
		} else {
			pane.hidden = true;
		}
	});
}

for (const tab of tabs) {
	tab.addEventListener('click', () => {
		select_tab(tab.dataset.paneName);
	});
}

select_tab(tabs[0].dataset.paneName);

const ROUTERS = ['rv128', 'rt130', 'rt131', 'rc140'];
const backbone_stats = document.querySelector('#backbone-stats');

Promise.allSettled(ROUTERS.map(async (router) => {
	const res = await fetch(`/routers/${router}`);
	if (!res.ok) throw new Error('Request failed');
	return res.json();
})).then((results) => {
	for (let i = 0; i < ROUTERS.length; i++) {
		const settlement = results[i];
		if (settlement.status != 'fulfilled') {
			console.error(settlement.reason);
			continue;
		}
		render_stats(ROUTERS[i], settlement.value);
	}
});

const render_stats = (router, stats) => {
	const h3 = document.createElement('h3');
	h3.textContent = router;
	backbone_stats.append(h3);

	const figure_rtt = document.createElement('figure');
	const caption_rtt = document.createElement('figcaption');
	caption_rtt.textContent = 'RTT (ms)';
	figure_rtt.append(caption_rtt);
	backbone_stats.append(figure_rtt);

	const figure_loss = document.createElement('figure');
	const caption_loss = document.createElement('figcaption');
	caption_loss.textContent = 'Packet loss (%)';
	figure_loss.append(caption_loss);
	backbone_stats.append(figure_loss);

	const graph_rtt = document.createElement('iframe');
	graph_rtt.src = 'https://menhera-org.github.io/time-chart/';
	figure_rtt.append(graph_rtt);

	const graph_loss = document.createElement('iframe');
	graph_loss.src = 'https://menhera-org.github.io/time-chart/';
	figure_loss.append(graph_loss);

	const data_rtt = {};
	const data_loss = {};
	for (const peer in stats) {
		const peer_stats = stats[peer] ?? [];
		if (!peer_stats) continue;
		
		const series_rtt = [];
		const series_loss = [];
		for (const minute_stat of peer_stats) {
			const entry_rtt = {
				time: minute_stat.timestamp,
				value: Number(minute_stat.average_delay ?? 0),
			};

			const entry_loss = {
				time: minute_stat.timestamp,
				value: 100 - minute_stat.count / 60 * 100,
			};

			series_rtt.push(entry_rtt);
			series_loss.push(entry_loss);
		}

		data_rtt[peer] = series_rtt;
		data_loss[peer] = series_loss;
	}

	graph_rtt.onload = () => {
		graph_rtt.contentWindow?.postMessage({
			type: 'update-chart',
			value: data_rtt,
		}, '*');
	};

	graph_loss.onload = () => {
		graph_loss.contentWindow?.postMessage({
			type: 'update-chart',
			value: data_loss,
		}, '*');
	};
};
