"use strict";

(() => {
  const view = document.getElementById("portal-view");
  const navigation = document.getElementById("portal-nav");

  function metricCard(title, description) {
    return '<article class="portal-card"><div class="portal-card-head"><span>' + title + '</span><span class="state-pill">UNAVAILABLE</span></div><strong>—</strong><p>' + description + '</p></article>';
  }

  function emptyPage(description, icon) {
    return '<div class="portal-empty-grid"><section class="portal-empty-card"><div class="empty-symbol">' + icon + '</div><h2>No data available</h2><p>' + description + '</p><span class="state-pill">NOT CONNECTED</span></section><section class="portal-action-card"><h2>Why is this empty?</h2><p>This preview has no authenticated user, backend session, subscription entitlement, API key, or telemetry source. It does not insert placeholder records.</p><div class="portal-action"><a class="button button-quiet" href="developers.html#status">Service status</a></div></section></div>';
  }

  const protection = '<div class="protection-hero"><div class="protection-orbit orbit-a"></div><div class="protection-orbit orbit-b"></div>' +
    '<div class="protection-seal"><svg viewBox="0 0 150 176" aria-hidden="true"><path d="M75 5 137 28v46c0 43-25 76-62 96C38 150 13 117 13 74V28L75 5Z" fill="rgba(26,205,234,.06)" stroke="currentColor" stroke-width="2"/><path d="M75 21 121 38v36c0 33-17 58-46 75-29-17-46-42-46-75V38l46-17Z" fill="none" stroke="currentColor" stroke-opacity=".35"/><text x="75" y="96" text-anchor="middle" fill="white" font-family="Arial,sans-serif" font-size="39" font-weight="700">GV</text></svg></div>' +
    '<div class="protection-state"><span class="state-indicator"><i></i> NOT CONNECTED</span><h2>No live protection data</h2><p>Connect an authenticated monitoring source before this snapshot can display customer-specific information.</p></div><div class="snapshot-meta"><span>LAST VERIFIED</span><b>—</b><span>SOURCES CONNECTED</span><b>—</b></div></div>' +
    '<div class="portal-card-grid">' + metricCard('ADVISORY STATUS', 'No advisory events have been retrieved.') + metricCard('OPEN ALERTS', 'Alerts require an authenticated data connection.') + metricCard('API USAGE', 'Usage is not connected to a customer account.') + '</div>' +
    '<p class="portal-footnote">The interface animation is decorative. It does not indicate that a model, workload, or environment is being monitored or protected.</p>';

  const pages = {
    protection: ['Protection snapshot', 'Your operational advisory view. Live monitoring is not connected.', protection],
    overview: ['Workspace overview', 'Customer workspace · no account data connected', emptyPage('Account overview, connected sources, and service status are unavailable until a verified customer session exists.', '▦')],
    activity: ['Activity', 'Customer workspace · no account data connected', emptyPage('No account activity has been retrieved. This page will show customer-scoped events only after a verified data connection is available.', '⌁')],
    reports: ['Reports', 'Customer workspace · no account data connected', emptyPage('No reports are available. No sample or simulated monitoring results are shown in this workspace.', '▤')],
    alerts: ['Alerts', 'Customer workspace · no account data connected', emptyPage('Alert delivery is not connected. There are no verified customer alerts to display.', '◇')],
    usage: ['Usage', 'Customer workspace · no account data connected', emptyPage('Usage metering is unavailable until the paid entitlement and advisory API are connected.', '◷')],
    'api-keys': ['API key management', 'Keys should be shown once and stored securely by you.', '<div class="portal-empty-grid"><section class="portal-empty-card"><div class="empty-symbol">⌘</div><h2>No API key issued</h2><p>Key issuance and entitlement checks are not connected. This page cannot create, reveal, rotate, or revoke a credential.</p><span class="state-pill">KEY SERVICE UNAVAILABLE</span></section><section class="portal-action-card"><h2>Keep credentials safe</h2><p>Never place a customer key in browser code, screenshots, or public repositories. The advisory service is not enabled for this account.</p><div class="portal-action"><a class="button button-quiet" href="developers.html">Developer status</a></div></section></div>'],
    billing: ['Subscription', 'Billing history and entitlement status require a verified account connection.', '<div class="portal-empty-grid"><section class="portal-empty-card"><div class="empty-symbol">◇</div><h2>No subscription linked</h2><p>No subscription state was queried. Checkout is unavailable, and no payment action has been taken.</p><span class="state-pill">BILLING UNAVAILABLE</span></section><section class="portal-action-card"><h2>GVAI Advisory API</h2><p>$99 USD per month. Customer checkout remains closed until billing persistence, webhook processing, entitlement, and API-key issuance are verified.</p><div class="portal-action"><a class="button button-quiet" href="pricing.html">View pricing status</a></div></section></div>'],
    settings: ['Account settings', 'Account controls are unavailable until authentication and account services are connected.', '<div class="portal-empty-card"><h2>No authenticated account</h2><p>There is no profile, email, organization, or security setting loaded into this preview.</p><div class="unavailable-banner"><strong>Unavailable:</strong> profile edits, password changes, session management, account recovery, and deletion.</div><div class="portal-field-grid"><div class="portal-field"><small>ACCOUNT ID</small><b>—</b></div><div class="portal-field"><small>AUTHENTICATION</small><b>Not connected</b></div></div></div>'],
    'ask-gvai': ['Ask GvAI', 'Ask about advisory workflows when the authenticated chat service is available.', '<div class="portal-empty-grid"><section class="portal-empty-card"><div class="empty-symbol">✳</div><h2>Chat is not connected</h2><p>This page will not invent an AI response or send your question to an unknown endpoint.</p><form class="portal-form" id="ask-form"><label for="question">Your question</label><textarea id="question" name="question" maxlength="2000" placeholder="Ask about an advisory workflow…"></textarea><button class="button button-quiet" type="submit">Check chat status</button><p class="portal-form-status" id="ask-status" role="status" aria-live="polite"></p></form></section><section class="portal-action-card"><h2>Need product information?</h2><p>Public capability and integration status are available without sending data.</p><div class="portal-action"><a class="button button-quiet" href="features.html">Capabilities</a><a class="button button-quiet" href="developers.html">Developer status</a></div></section></div>'],
  };

  function currentRoute() {
    const route = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
    return Object.prototype.hasOwnProperty.call(pages, route) ? route : 'protection';
  }

  function render() {
    const route = currentRoute();
    const page = pages[route];
    const routeLabel = route.replaceAll('-', ' ').toUpperCase();
    view.innerHTML = '<section class="portal-page"><p class="portal-kicker">CUSTOMER WORKSPACE / ' + routeLabel + '</p><h1>' + page[0] + '</h1><p class="portal-subtitle">' + page[1] + '</p>' + page[2] + '</section>';
    document.title = page[0] + ' · Workspace preview | GVAI Safety Systems';
    navigation.querySelectorAll('[data-route]').forEach((link) => {
      if (link.dataset.route === route) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });

    const askForm = document.getElementById('ask-form');
    if (askForm) {
      askForm.addEventListener('submit', (event) => {
        event.preventDefault();
        document.getElementById('ask-status').textContent = 'Chat is unavailable. Your question was not sent or saved.';
      });
    }
  }

  if (!location.hash) history.replaceState(null, '', location.pathname + '#/protection');
  window.addEventListener('hashchange', render);
  navigation.addEventListener('click', (event) => {
    if (event.target.closest('a[data-route]')) render();
  });
  render();
})();
