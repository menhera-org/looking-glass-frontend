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

// returns { avg, min, max, stddev }
function calc_stats(values) {
	const sum = values.reduce((acc, value) => acc + value, 0);
	const avg = sum / values.length;
	const min = Math.min(...values);
	const max = Math.max(...values);
	const stddev = Math.sqrt(values.reduce((acc, value) => acc + (value - avg) ** 2, 0) / values.length);
	return { avg, min, max, stddev };
}

for (const tab of tabs) {
	tab.addEventListener('click', () => {
		select_tab(tab.dataset.paneName);
	});
}

select_tab(tabs[0].dataset.paneName);

const ROUTERS = ['rv128', 'rt130', 'rt131', 'rc140'];
const backbone_stats = document.querySelector('#backbone-stats');

for (const router of ROUTERS) {
	const router_summary = document.createElement('div');
	router_summary.classList.add('router-summary');
	const h3 = document.createElement('h3');
	h3.textContent = router;
	router_summary.append(h3);
	backbone_stats.append(router_summary);
	(async (router) => {
		try {
			const res = await fetch(`/routers/${router}`);
			if (!res.ok) throw new Error('Request failed');
			return res.json();
		} catch (e) {
			return null;
		}
	})(router).then((stats) => {
		if (stats == null) {
			const p = document.createElement('p');
			p.textContent = 'Failed to fetch stats';
			router_summary.append(p);
			return;
		}
		const table = document.createElement('table');
		const thead = document.createElement('thead');
		const tbody = document.createElement('tbody');
		const tr = document.createElement('tr');
		const th_peer = document.createElement('th');
		th_peer.textContent = 'Peer';
		const th_rtt_avg = document.createElement('th');
		th_rtt_avg.textContent = 'RTT (ms): avg';
		const th_rtt_min = document.createElement('th');
		th_rtt_min.textContent = 'RTT (ms): min';
		const th_rtt_max = document.createElement('th');
		th_rtt_max.textContent = 'RTT (ms): max';
		const th_rtt_stddev = document.createElement('th');
		th_rtt_stddev.textContent = 'RTT (ms): stddev';
		const th_loss = document.createElement('th');
		th_loss.textContent = 'Packet loss (%)';
		tr.append(th_peer, th_rtt_avg, th_rtt_min, th_rtt_max, th_rtt_stddev, th_loss);
		thead.append(tr);
		table.append(thead, tbody);
		router_summary.append(table);

		const figure_rtt = document.createElement('figure');
		const caption_rtt = document.createElement('figcaption');
		caption_rtt.textContent = 'RTT (ms)';
		figure_rtt.append(caption_rtt);
		router_summary.append(figure_rtt);
	
		const figure_loss = document.createElement('figure');
		const caption_loss = document.createElement('figcaption');
		caption_loss.textContent = 'Packet loss (%)';
		figure_loss.append(caption_loss);
		router_summary.append(figure_loss);
	
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

			let packet_count = 0;
			let minute_count = 0;
			const rtt_by_minute = [];
			
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

				if (minute_stat.count != 0) {
					rtt_by_minute.push(minute_stat.average_delay);
					packet_count += minute_stat.count;
				}

				minute_count += 1;
	
				series_rtt.push(entry_rtt);
				series_loss.push(entry_loss);
			}
	
			data_rtt[peer] = series_rtt;
			data_loss[peer] = series_loss;

			if (0 == minute_count) continue;
			const rtt_stats = calc_stats(rtt_by_minute);
			const tr = document.createElement('tr');
			const td_peer = document.createElement('td');
			td_peer.textContent = peer;
			const td_rtt_avg = document.createElement('td');
			td_rtt_avg.textContent = rtt_stats.avg.toFixed(2);
			const td_rtt_min = document.createElement('td');
			td_rtt_min.textContent = rtt_stats.min.toFixed(2);
			const td_rtt_max = document.createElement('td');
			td_rtt_max.textContent = rtt_stats.max.toFixed(2);
			const td_rtt_stddev = document.createElement('td');
			td_rtt_stddev.textContent = rtt_stats.stddev.toFixed(2);
			const td_loss = document.createElement('td');
			td_loss.textContent = (100 - packet_count / 60 * 100 * minute_count).toFixed(2);
			tr.append(td_peer, td_rtt_avg, td_rtt_min, td_rtt_max, td_rtt_stddev, td_loss);
			tbody.append(tr);
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
	});
}
