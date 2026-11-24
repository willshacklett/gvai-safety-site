"use strict";

(() => {
  const view = document.getElementById("portal-view");
  const protection = view.firstElementChild;
  const menu = document.getElementById("workspace-menu");
  const narrowLayout = menu && window.matchMedia('(max-width: 760px)');
  const incidentPath = '#/incidents/DEMO-001';
  const demoReview = { acknowledged: false, requested: false };
  let demoPreferences = { sms: false, email: false, threshold: 'high' };

  function emptyPage(description, icon) {
    return '<div class="portal-empty-grid"><section class="portal-empty-card"><div class="empty-symbol">' + icon + '</div><h2>No data available</h2><p>' + description + '</p><span class="state-pill">NOT CONNECTED</span></section><section class="portal-action-card"><h2>Why is this empty?</h2><p>This preview has no authenticated user, backend session, subscription entitlement, API key, or telemetry source. It does not insert placeholder records.</p><div class="portal-action"><a class="button button-quiet" href="developers.html#status">Service status</a></div></section></div>';
  }

  const pages = {
    protection: ['Customer Protection Snapshot'],
    overview: ['Workspace overview', 'Customer workspace · no account data connected', emptyPage('Account overview, connected sources, and service status are unavailable until a verified customer session exists.', '▦')],
    activity: ['Activity', 'Customer workspace · no account data connected', emptyPage('No account activity has been retrieved. This page will show customer-scoped events only after a verified data connection is available.', '⌁')],
    reports: ['Reports', 'Customer workspace · no account data connected', emptyPage('No reports are available. No sample or simulated monitoring results are shown in this workspace.', '▤')],
    alerts: ['Alerts', 'Customer workspace · no account data connected', emptyPage('Alert delivery is not connected. There are no verified customer alerts to display.', '◇')],
    incidents: ['Incident center', 'Follow a sample notification to an illustrative incident.', '', 'incident-center-template'],
    notifications: ['Notification preferences', 'Preview how you would choose which incident alerts to receive.', '', 'notification-template'],
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

  function setupIncident() {
    const acknowledge = document.getElementById('demo-acknowledge');
    const requestReview = document.getElementById('demo-review');
    const status = document.getElementById('demo-review-status');

    function updateReview() {
      acknowledge.setAttribute('aria-disabled', String(demoReview.acknowledged));
      requestReview.setAttribute('aria-disabled', String(demoReview.requested));
      const acknowledgment = demoReview.acknowledged ? 'Sample acknowledged.' : 'Sample awaiting acknowledgment.';
      const review = demoReview.requested ? 'Demo review requested. No reviewer was contacted.' : 'No demo review requested.';
      status.textContent = acknowledgment + ' ' + review;
    }

    acknowledge.addEventListener('click', () => {
      if (demoReview.acknowledged) return;
      demoReview.acknowledged = true;
      updateReview();
    });
    requestReview.addEventListener('click', () => {
      if (demoReview.requested) return;
      demoReview.requested = true;
      updateReview();
    });
    updateReview();
  }

  function setupPreferences() {
    const form = view.querySelector('.incident-preferences');
    const sms = document.getElementById('demo-sms');
    const email = document.getElementById('demo-email');
    const threshold = document.getElementById('demo-threshold');
    const status = document.getElementById('demo-preference-status');
    sms.checked = demoPreferences.sms;
    email.checked = demoPreferences.email;
    threshold.value = demoPreferences.threshold;

    form.addEventListener('change', () => {
      status.textContent = 'Changes pending. Apply demo preferences to keep them for this page session.';
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      demoPreferences = { sms: sms.checked, email: email.checked, threshold: threshold.value };
      const channels = [sms.checked ? 'SMS' : '', email.checked ? 'Email' : ''].filter(Boolean);
      status.textContent = 'Demo preferences applied. Channels: ' + (channels.join(' and ') || 'none') +
        '. Threshold: ' + threshold.selectedOptions[0].text + '. No messages sent.';
    });
  }

  function render(moveFocus = false) {
    const route = currentRoute();
    let page = pages[route];
    if (route === 'incidents' && location.hash === incidentPath) {
      page = ['Incident detail', 'Illustrative advisory · DEMO / NOT LIVE', '', 'incident-detail-template'];
    } else if (route === 'incidents' && location.hash !== '#/incidents') {
      page = ['Sample incident unavailable', 'DEMO / NOT LIVE · This preview contains one fixed synthetic incident.', '<a class="incident-link" href="#/incidents">Back to incident center</a>'];
    }

    const [title, subtitle, content, templateId] = page;
    if (route === 'protection') {
      view.replaceChildren(protection);
    } else {
      const routeLabel = route.replaceAll('-', ' ').toUpperCase();
      view.innerHTML = '<section class="portal-page"><p class="portal-kicker">CUSTOMER WORKSPACE / ' + routeLabel + '</p><h1 tabindex="-1">' + title + '</h1><p class="portal-subtitle">' + subtitle + '</p>' + content + '</section>';
      if (templateId) {
        view.firstElementChild.append(document.getElementById(templateId).content.cloneNode(true));
      }
    }
    document.title = title + ' · Workspace preview | GVAI Safety Systems';
    document.querySelectorAll('.portal-nav [data-route]').forEach((link) => {
      if (link.dataset.route === route) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    if (templateId === 'incident-detail-template') setupIncident();
    if (templateId === 'notification-template') setupPreferences();
    if (moveFocus) {
      const heading = view.querySelector('h1');
      heading.focus({ preventScroll: true });
      if (narrowLayout?.matches) menu.open = false;
      heading.scrollIntoView({ block: 'start' });
    }

    const askForm = document.getElementById('ask-form');
    if (askForm) {
      askForm.addEventListener('submit', (event) => {
        event.preventDefault();
        document.getElementById('ask-status').textContent = 'Chat is unavailable. Your question was not sent or saved.';
      });
    }
  }

  if (!location.hash) history.replaceState(null, '', location.pathname + '#/protection');
  document.querySelector('.skip-link').addEventListener('click', (event) => {
    event.preventDefault();
    document.getElementById('workspace-main').focus();
  });
  if (narrowLayout) {
    function syncNavigation() {
      menu.open = !narrowLayout.matches || menu.contains(document.activeElement);
    }

    narrowLayout.addEventListener('change', syncNavigation);
    syncNavigation();
  }

  window.addEventListener('hashchange', () => render(true));
  render(location.hash.startsWith('#/incidents/'));
})();
