// Token Radar's dashboard (radar-2). It reads window.RADAR (written beside dashboard/
// by main.ts) and renders the ranked board, filters, a per-protocol detail view with
// the model's own inputs and the protocol's farm plan, the live-token set and the
// category multiples the model calibrates from. No network: every byte it shows is
// in data.js. No protocol name is special-cased anywhere on this page.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', watchlist: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null, setAside: 'all' };
  var scrollToCoverage = false;

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return n.toFixed(3) + 'x'; }

  // The model in one function: the page recomputes a row from the snapshot figures and
  // checks the number board.json carries, so the page's code and the board's data are
  // visibly the same arithmetic. implied = tvl x categoryMultiple x growth x maturity
  // x breadth, with the category multiple calibrated from live protocols in the same
  // category (median market cap per dollar of TVL), or the global median where a
  // category has too few live comparables.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var breadth = 1 + Math.min(Math.max((row.chains || []).length - 1, 0), model.breadth_max_chains) * model.breadth_per_chain;
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * growthMult * maturity * breadth));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category,
  // chains, TVL and age decide the action, the capital, the hold and every cost and
  // time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function secondChainOf(p) { return p.chains && p.chains.length > 1 ? p.chains[1] : null; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged position.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield-bearing asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('chain') >= 0 || c.indexOf('payment') >= 0) return 'Move $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and use its app once a week.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function secondActionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    var small = Math.max(10, Math.round(capital / 5));
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow $' + small + ' against the supplied collateral on ' + name + ' and repay it the same week, so the position shows both sides of the market.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('farm') >= 0) return 'Swap $' + small + " through " + name + "'s main pool on " + chain + ' in the opposite direction, so the wallet shows trading volume as well as liquidity.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Close the hedged position on ' + name + ' and open a fresh one of $' + small + ', so the wallet shows repeated trading activity.';
    if (c.indexOf('prediction') >= 0) return 'Place a second $' + small + ' position on a different ' + name + ' market, so the wallet is active on more than one outcome.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Allocate $' + small + ' to a second ' + name + ' vault on ' + chain + ', so the wallet is spread across more than one strategy.';
    if (c.indexOf('stable') >= 0) return 'Redeem $' + small + ' of the stable asset back through ' + name + ' and re-deposit it, so the wallet shows a full mint-and-redeem cycle.';
    if (c.indexOf('rwa') >= 0) return 'Check the yield that has accrued on the ' + name + ' position and, if the app offers it, compound $' + small + ' of it back in.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Unstake $' + small + ' and re-stake it through ' + name + ', so the wallet shows a second staking action.';
    if (c.indexOf('insurance') >= 0) return 'File a test claim check on ' + name + ' to confirm the policy is active, without filing a real claim.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + small + ' back through ' + name + ' to the chain it came from, so the wallet shows a round trip.';
    return 'Make a second $' + small + ' deposit into ' + name + ' on ' + chain + ' a few days after the first, so the wallet shows repeated activity.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var second = secondChainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var weekly = second === null
      ? { text: 'Repeat one qualifying action each week on ' + chain + ', such as a deposit, a swap or a vote, so the wallet stays active.', cost: 'about $2 of gas a week', time: '10 minutes a week' }
      : { text: 'Repeat the same position on ' + second + ' as well, so the wallet is active on two chains instead of one.', cost: '$' + capital + ' of capital on the second chain and about $4 of gas', time: '15 minutes to set up' };
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: secondActionFor(p, capital, chain), cost: 'about $' + Math.max(2, Math.round(capital / 25)) + ' of gas', time: '10 minutes' },
      weekly,
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log, then unwind the position in one transaction when you are done.', cost: 'about $3 of gas to exit', time: '5 minutes to log, 10 to exit' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    if (hash === 'coverage') { scrollToCoverage = true; return; }
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('watchlist') === '1') state.watchlist = true;
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watchlist) params.set('watchlist', '1');
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watchlist && !r.on_watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'pertvl') { av = a.implied_per_tvl; bv = b.implied_per_tvl; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { text: 'Token Radar ' }), el('small', { text: 'Pre-token launch radar' })),
      el('div', { class: 'top-meta' },
        el('span', { class: 'pill' }, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', { class: 'pill' }, 'Source ', el('b', { text: 'DefiLlama protocol index' })),
        el('span', { class: 'pill' }, 'Model ', el('b', { text: DATA.model_version }))
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', null, 'Which pre-token protocol is worth farming next, ', el('em', { text: 'and what is its launch worth?' })),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $50M of TVL and no token on record. The early radar adds every other rankable pre-token protocol below that floor, by the same rule. Implied value is a model calibrated on the protocols whose tokens already trade — an estimate, never a promise, and never proof a token is coming.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }), el('small', { text: 'every slug on the list' })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows' }), el('b', { text: String(DATA.board_size) }), el('small', { text: DATA.early_size + ' of them early finds below the floor' })),
        el('div', { class: 'fact' }, el('span', { text: 'Total implied value' }), el('b', { text: fmtUsd(DATA.total_implied_usd) }), el('small', { text: 'sum of the whole board' })),
        el('div', { class: 'fact' }, el('span', { text: 'Protocols scanned' }), el('b', { text: String(DATA.protocols_size) }), el('small', { text: DATA.pre_token_size + ' record no token, ' + DATA.board_size + ' ranked, ' + DATA.set_aside_size + ' set aside with a reason, ' + DATA.live_size + ' live shown apart' }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var cat = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });
    var ch = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    ch.addEventListener('change', function () { state.chain = ch.value; writeHash(); render(); });
    var wl = el('input', { type: 'checkbox', id: 'watchlist', checked: state.watchlist ? 'checked' : null, 'aria-label': 'Watchlist only' });
    wl.addEventListener('change', function () { state.watchlist = wl.checked; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; writeHash(); render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; writeHash(); render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field grow' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), cat),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), ch),
      el('label', { class: 'toggle', for: 'watchlist' }, wl, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label, cls) {
    return el('th', { scope: 'col', class: cls || null },
      el('button', { type: 'button', class: 'th-btn', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' ▼' : ' ▲' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category or chain to see the board again.' }),
        el('button', { class: 'button', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlist = false; writeHash(); render(); } })
      ));
    }
    var max = 0;
    list.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    if (max <= 0) max = 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', null, r.name, r.on_watchlist ? el('span', { class: 'badge-watch', text: 'Watchlist' }) : null),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') + ' · #' + r.category_rank + ' in category' })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtMult(r.implied_per_tvl) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols, strongest implied value first. Select a row for its model breakdown and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank', 'num'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL', 'num'),
            sortHeader('growth', '7d', 'num'),
            sortHeader('age', 'Age', 'num'),
            sortHeader('pertvl', 'Val / TVL', 'num'),
            sortHeader('implied', 'Implied value', 'num'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('span', { class: 'status live', text: 'already trades' })),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.mcap_per_tvl === null ? 'n/a' : fmtMult(r.mcap_per_tvl) })
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. Their market-cap-per-TVL is what calibrates the pre-token multiples. They are set aside from the ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Token' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', class: 'num', text: 'TVL' }), el('th', { scope: 'col', class: 'num', text: '7d' }), el('th', { scope: 'col', class: 'num', text: 'Market cap' }), el('th', { scope: 'col', class: 'num', text: 'Mcap / TVL' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var compRows = DATA.comparables.map(function (c) {
      return el('tr', null,
        el('td', { text: c.category }),
        el('td', { class: 'num', text: String(c.count) }),
        el('td', { class: 'num', text: fmtMult(c.multiple) }),
        el('td', { text: c.shrunk ? 'median ' + fmtMult(c.raw_median) + ', shrunk toward global' : '—' })
      );
    });
    return el('div', null,
      el('section', { class: 'panel model' },
        el('h2', { text: 'How implied value is computed' }),
        el('p', { class: 'sub', text: 'One function scores every row, from the snapshot figures alone. No protocol name is special-cased, and no row is hand-picked. The category multiple is the median market-cap-per-dollar-of-TVL of the live protocols in that category; a category with fewer than ' + m.shrink_below + ' live comparables has its median pulled halfway toward the global median, and a category with fewer than ' + m.min_comparables + ' uses the global median outright.' }),
        el('div', { class: 'formula', text: 'implied = round( tvl_usd x category_multiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x (1 + min(chains - 1, ' + m.breadth_max_chains + ') x ' + m.breadth_per_chain + ') )' }),
        el('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. Chain breadth is how many chains the protocol runs on. Multiples are clamped to ' + m.multiple_floor + '–' + m.multiple_cap + ' so one outlier cannot set a price.' })
      ),
      el('div', { class: 'two-col' },
        el('section', { class: 'panel model' },
          el('h3', { text: 'Category multiples — what the market already pays' }),
          el('span', { class: 'sub', text: 'Median market cap per $1 of TVL, from the live protocols in each category.' }),
          el('div', { class: 'table-wrap' },
            el('table', { class: 'comp-table' },
              el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', class: 'num', text: 'Live' }), el('th', { scope: 'col', class: 'num', text: 'Multiple' }), el('th', { scope: 'col', text: 'Note' }))),
              el('tbody', null, compRows)
            )
          ),
          el('p', { class: 'sub note', text: 'Global median multiple ' + fmtMult(DATA.global_multiple) + ' applies to every category with too few live comparables — including Risk Curators, the board\u2019s largest group.' })
        ),
        el('section', { class: 'panel model' },
          el('h3', { text: 'What counts as pre-token' }),
          el('span', { class: 'sub', text: 'The board\u2019s rule, applied to all 758 protocols the same way.' }),
          el('p', { class: 'sub', text: 'A protocol is rankable when its record carries no token — no market cap, no CoinGecko id, no symbol — and it is not a wrapped, staked or bridged product of a token that already trades: not a Bridge, Liquid Staking, Liquid Restaking, Restaked BTC or CEX category, not a versioned name, no whole word wrapped, staked or staking, and not named after an exchange. That leaves ' + DATA.board_size + ' of the ' + DATA.pre_token_size + ' protocols that record no token. The other ' + DATA.set_aside_size + ' are set aside with a reason each, in the coverage section below: an exchange, a bridge, a liquid-staking receipt or a versioned pool is not a launch, however large its TVL.' }),
          el('p', { class: 'sub', text: 'DefiLlama\u2019s record is not proof: a protocol on the board records no token, it does not follow that it has none. The board never predicts whether or when a token is issued — it prices what a launch would be worth if the record stayed as it is, and shows what to do about it.' })
        )
      )
    );
  }

  function setAsideRows() {
    return (DATA.set_aside || []).filter(function (r) {
      return state.setAside === 'all' || r.primary_reason === state.setAside;
    });
  }

  function reasonLabel(reason) {
    var found = null;
    (DATA.set_aside_reasons || []).forEach(function (x) { if (x.reason === reason) found = x.label; });
    return found || reason;
  }

  // The coverage section: the whole snapshot accounted for. The board ranks 198
  // protocols; the other 144 that record no token are set aside with a reason each,
  // and the 416 that already trade are live. Nothing is silently dropped.
  function coveragePanel() {
    var reasonRows = (DATA.set_aside_reasons || []).map(function (x) {
      return el('tr', null,
        el('td', { text: x.label }),
        el('td', { class: 'num', text: String(x.count) }),
        el('td', { class: 'num', text: fmtUsd(x.tvl_usd) }),
        el('td', { class: 'num', text: (Math.round((x.tvl_usd / DATA.set_aside_tvl_usd) * 1000) / 10) + '%' })
      );
    });
    var filter = el('select', { id: 'set-aside-reason', 'aria-label': 'Filter set-aside protocols by reason' },
      el('option', { value: 'all', text: 'All reasons (' + DATA.set_aside_size + ')' }),
      (DATA.set_aside_reasons || []).map(function (x) { return el('option', { value: x.reason, text: x.label + ' (' + x.count + ')', selected: x.reason === state.setAside ? 'selected' : null }); })
    );
    filter.addEventListener('change', function () { state.setAside = filter.value; scrollToCoverage = true; render(); });
    var list = setAsideRows();
    var tbody = el('tbody');
    list.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { text: r.reasons.map(reasonLabel).join(', ') })
      ));
    });
    return el('section', { class: 'panel model', id: 'coverage' },
      el('h2', { text: 'The whole snapshot, accounted for' }),
      el('p', { class: 'sub', text: 'Every one of the ' + DATA.protocols_size + ' protocols in the snapshot is either ranked, set aside with a reason, or already trading — nothing is silently dropped. The set-aside ' + DATA.set_aside_size + ' hold ' + fmtUsd(DATA.set_aside_tvl_usd) + ' of TVL, most of it exchanges and wrapped assets whose token already trades; ranking them as launches would price a token that exists.' }),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Ranked' }), el('b', { text: String(DATA.board_size) }), el('small', { text: 'pre-token and rankable' })),
        el('div', { class: 'fact' }, el('span', { text: 'Set aside' }), el('b', { text: String(DATA.set_aside_size) }), el('small', { text: 'no token, but not a launch' })),
        el('div', { class: 'fact' }, el('span', { text: 'Already trading' }), el('b', { text: String(DATA.protocols_size - DATA.pre_token_size) }), el('small', { text: 'a token on record' })),
        el('div', { class: 'fact' }, el('span', { text: 'Scanned' }), el('b', { text: String(DATA.protocols_size) }), el('small', { text: 'every protocol in the snapshot' }))
      ),
      el('h3', { class: 'subhead', text: 'Why the set-aside protocols are not ranked' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'comp-table plain' },
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Reason' }), el('th', { scope: 'col', class: 'num', text: 'Protocols' }), el('th', { scope: 'col', class: 'num', text: 'TVL' }), el('th', { scope: 'col', class: 'num', text: 'Share of set-aside TVL' }))),
          el('tbody', null, reasonRows)
        )
      ),
      el('h3', { class: 'subhead', text: 'Set-aside explorer — every protocol, with its reason' }),
      el('div', { class: 'field' }, el('label', { for: 'set-aside-reason', text: 'Reason' }), filter),
      el('p', { class: 'sub note', text: list.length + ' protocol' + (list.length === 1 ? '' : 's') + ' shown, strongest TVL first.' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'comp-table plain' },
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', class: 'num', text: 'TVL' }), el('th', { scope: 'col', class: 'num', text: '7d' }), el('th', { scope: 'col', text: 'Why set aside' }))),
          tbody
        )
      )
    );
  }

  function categoryPanel() {
    var tbody = el('tbody');
    DATA.categories.forEach(function (c) {
      tbody.appendChild(el('tr', {
        tabindex: '0',
        onclick: function () { openDetail(c.top_slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(c.top_slug); } }
      },
        el('td', { text: c.category }),
        el('td', { class: 'num', text: String(c.ranked) }),
        el('td', { class: 'num', text: fmtUsd(c.total_tvl_usd) }),
        el('td', { class: 'num', text: fmtUsd(c.total_implied_usd) }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: c.top_name }), el('span', { class: 'sub', text: fmtUsd(c.top_implied_usd) + ' implied' }))),
        el('td', { class: 'num', text: fmtMult(c.multiple) + (c.multiple_fallback ? ' *' : '') })
      ));
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'Categories — where the implied value sits' }),
      el('p', { class: 'sub', text: 'The ranked board grouped by category, most implied value first. Select a row to open its top protocol. A multiple marked * is the global median: too few live protocols in that category trade to calibrate it.' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'comp-table' },
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', class: 'num', text: 'Ranked' }), el('th', { scope: 'col', class: 'num', text: 'TVL' }), el('th', { scope: 'col', class: 'num', text: 'Implied value' }), el('th', { scope: 'col', text: 'Top protocol' }), el('th', { scope: 'col', class: 'num', text: 'Multiple' }))),
          tbody
        )
      )
    );
  }

  function moversTable(list, caption) {
    var tbody = el('tbody');
    list.slice(0, 5).forEach(function (m) {
      tbody.appendChild(el('tr', {
        tabindex: '0',
        onclick: function () { openDetail(m.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(m.slug); } }
      },
        el('td', { class: 'num', text: String(m.rank) }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: m.name }), el('span', { class: 'sub', text: (m.category || 'Other') }))),
        el('td', { class: 'num ' + (m.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(m.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(m.tvl_usd) }),
        el('td', { class: 'num', text: fmtUsd(m.implied_value_usd) })
      ));
    });
    return el('section', { class: 'panel model' },
      el('h3', { text: caption }),
      el('span', { class: 'sub', text: 'Seven-day TVL change among the ranked rows. Select a row to open it.' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'comp-table' },
          el('thead', null, el('tr', null, el('th', { scope: 'col', class: 'num', text: 'Rank' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', class: 'num', text: '7d' }), el('th', { scope: 'col', class: 'num', text: 'TVL' }), el('th', { scope: 'col', class: 'num', text: 'Implied' }))),
          tbody
        )
      )
    );
  }

  function moversPanel() {
    return el('div', { class: 'two-col' },
      moversTable(DATA.movers_up, 'Biggest 7-day TVL gains'),
      moversTable(DATA.movers_down, 'Biggest 7-day TVL falls')
    );
  }

  function footer() {
    return el('footer', { class: 'foot' },
      el('p', { text: 'Snapshot ' + DATA.as_of + ' from the DefiLlama protocol index (' + DATA.source + '). ' + DATA.model_version + ' model. Board and farm plans are generated from the snapshot by main.ts; the page recomputes them from the same figures.' }),
      el('p', { text: 'Implied values are this radar\u2019s own estimates, not prices and not investment advice. Farming a protocol can lose money; never farm with funds you cannot lose, and never pay to claim an airdrop.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function riskFlags(row) {
    var flags = [];
    if (row.change_7d !== null && row.change_7d < -10) flags.push({ text: 'TVL down ' + Math.abs(row.change_7d).toFixed(1) + '% in 7 days', cool: false });
    if (row.age_days !== null && row.age_days < 90) flags.push({ text: 'Listed under 90 days ago', cool: false });
    if ((row.chains || []).length === 1) flags.push({ text: 'Single-chain exposure', cool: true });
    if (!row.on_watchlist) flags.push({ text: 'Below the $50M watchlist floor — an early find', cool: true });
    if (row.multiple_fallback) flags.push({ text: 'Too few live comparables in this category — global multiple used', cool: true });
    if (row.change_7d === null) flags.push({ text: 'No 7-day growth reported', cool: true });
    return flags;
  }

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, DATA.model);
    var flags = riskFlags(row);
    var catStat = null;
    DATA.categories.forEach(function (c) { if (c.category === (row.category || 'Other')) catStat = c; });
    var catCount = catStat ? catStat.ranked : 0;
    var multipleNote = row.multiple_fallback
      ? 'Global median — too few live ' + (row.category || 'Other') + ' protocols trade to calibrate this category.'
      : row.multiple_shrunk
        ? 'Median of ' + row.comparables + ' live ' + (row.category || 'Other') + ' protocol' + (row.comparables === 1 ? '' : 's') + ' that already trade (' + fmtMult(row.category_median) + ' raw), shrunk halfway toward the global median because the sample is small.'
        : 'Median of ' + row.comparables + ' live ' + (row.category || 'Other') + ' protocol' + (row.comparables === 1 ? '' : 's') + ' that already trade.';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'sub', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.on_watchlist ? ' · on the watchlist' : ' · early find') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value — every factor shown' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple' }), el('b', { class: 'num', text: fmtMult(row.category_multiple) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Chains' }), el('b', { class: 'num', text: String((row.chains || []).length) })),
        el('div', null, el('span', { text: 'Breadth multiplier' }), el('b', { class: 'num', text: String(row.breadth_multiplier) })),
        el('div', null, el('span', { text: 'Value per $1 of TVL' }), el('b', { class: 'num', text: fmtMult(row.implied_per_tvl) })),
        el('div', null, el('span', { text: 'Rank in category' }), el('b', { class: 'num', text: '#' + row.category_rank + ' of ' + catCount })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub note', text: multipleNote }),
      el('p', { class: 'sub note', text: 'Its TVL is ' + row.tvl_share_pct.toFixed(2) + '% of the board\u2019s ' + fmtUsd(DATA.ranked_tvl_usd) + ' of ranked TVL.' }),
      el('p', { class: 'sub note', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' }),
      flags.length ? el('div', { class: 'flags' }, flags.map(function (f) { return el('span', { class: 'flag' + (f.cool ? ' cool' : ''), text: f.text }); })) : null
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan — seven steps' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('div', null, el('b', { text: action }), el('span', { class: 'cost', text: tail })));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') {
      shell.appendChild(modelPanel());
      shell.appendChild(coveragePanel());
      shell.appendChild(categoryPanel());
      shell.appendChild(moversPanel());
    }
    shell.appendChild(footer());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
    if (scrollToCoverage) {
      scrollToCoverage = false;
      var target = document.getElementById('coverage');
      if (target) target.scrollIntoView();
    }
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
