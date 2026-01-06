import { apiGet, apiPost } from '../api/client.js';
import { attachGlobalErrorHandler, showToast } from '../ui/notifications.js';

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'short',
  timeStyle: 'short'
});

const tableConfig = {
  waitlist: [
    { key: 'name', label: 'Name' },
    { key: 'company', label: 'Company' },
    { key: 'email', label: 'Email' },
    { key: 'country', label: 'Country', formatter: formatLocation },
    { key: 'city', label: 'City', formatter: formatCity },
    { key: 'deviceType', label: 'Device', formatter: formatDeviceType },
    { key: 'ip', label: 'IP', formatter: formatIP },
    { key: 'createdAt', label: 'Joined', formatter: formatDate }
  ],
  logins: [
    { key: 'email', label: 'Email' },
    { key: 'role', label: 'Role' },
    { key: 'method', label: 'Method' },
    { key: 'country', label: 'Country', formatter: formatLocation },
    { key: 'deviceType', label: 'Device', formatter: formatDeviceType },
    { key: 'ip', label: 'IP', formatter: formatIP },
    { key: 'occurredAt', label: 'Timestamp', formatter: formatDate }
  ],
  searches: [
    { key: 'email', label: 'Email' },
    { key: 'query', label: 'Search Query', formatter: formatQuery },
    { key: 'resultsCount', label: 'Results' },
    { key: 'country', label: 'Country', formatter: formatLocation },
    { key: 'deviceType', label: 'Device', formatter: formatDeviceType },
    { key: 'ip', label: 'IP', formatter: formatIP },
    { key: 'occurredAt', label: 'Time', formatter: formatDate }
  ],
  upgrades: [
    { key: 'email', label: 'Email' },
    { key: 'method', label: 'Method' },
    { key: 'metadata', label: 'Details', formatter: (_, row) => formatMetadata(row.metadata) },
    { key: 'updatedAt', label: 'Updated', formatter: formatDate }
  ]
};

function formatDate (value) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return dateFormatter.format(parsed);
}

function formatMetadata (metadata = {}) {
  if (!metadata) return '—';
  if (metadata.sessionId) return `Stripe ${metadata.sessionId.slice(0, 8)}…`;
  if (metadata.txId) return `Bitcoin ${metadata.txId.slice(0, 8)}…`;
  if (metadata.code) return `Promo ${metadata.code}`;
  return '—';
}

function formatIP (value) {
  if (!value || value === 'unknown') return '—';
  return value;
}

function formatLocation (value) {
  if (!value || value === 'Unknown') return '—';
  return value;
}

function formatCity (value) {
  if (!value || value === 'Unknown') return '—';
  return value;
}

function formatDeviceType (value) {
  if (!value) return '—';
  const type = value.toLowerCase();
  const badges = {
    mobile: '<span class="device-badge device-mobile">Mobile</span>',
    tablet: '<span class="device-badge device-tablet">Tablet</span>',
    desktop: '<span class="device-badge device-desktop">Desktop</span>'
  };
  return badges[type] || value;
}

function formatQuery (value) {
  if (!value) return '—';
  const maxLength = 30;
  if (value.length > maxLength) {
    return value.substring(0, maxLength) + '…';
  }
  return value;
}

function renderTable (targetId, rows, columns, actions = null) {
  const target = document.getElementById(targetId);
  if (!target) return;
  if (!rows.length) {
    target.innerHTML = '<p class="owner-empty">No records yet.</p>';
    return;
  }
  const header = columns.map(col => `<th>${col.label}</th>`).join('');
  const actionsHeader = actions ? '<th>Actions</th>' : '';
  const body = rows.map((row, index) => {
    const cells = columns.map(col => {
      const rawValue = row[col.key];
      const value = col.formatter ? col.formatter(rawValue, row) : (rawValue ?? '—');
      return `<td>${value ?? '—'}</td>`;
    }).join('');
    const actionCells = actions ? `<td>${actions(row, index)}</td>` : '';
    return `<tr>${cells}${actionCells}</tr>`;
  }).join('');
  target.innerHTML = `<table><thead><tr>${header}${actionsHeader}</tr></thead><tbody>${body}</tbody></table>`;
}

async function handleBan (email) {
  if (!confirm(`Ban account ${email}?`)) return;
  const reason = prompt('Reason for ban (optional):') || '';
  try {
    await apiPost('/api/owner/ban', { email, reason });
    showToast('Account banned', 'success');
    await loadBannedAccounts();
    await hydrateDashboard();
  } catch (error) {
    showToast(error.message || 'Failed to ban account', 'error');
  }
}

async function handleUnban (email) {
  if (!confirm(`Unban account ${email}?`)) return;
  try {
    await apiPost('/api/owner/unban', { email });
    showToast('Account unbanned', 'success');
    await loadBannedAccounts();
    await hydrateDashboard();
  } catch (error) {
    showToast(error.message || 'Failed to unban account', 'error');
  }
}

async function loadBannedAccounts () {
  try {
    const data = await apiGet('/api/owner/banned');
    const banned = data.banned || [];
    const bannedCountEl = document.getElementById('bannedCount');
    if (bannedCountEl) {
      bannedCountEl.textContent = `${banned.length} banned`;
    }
    const bannedColumns = [
      { key: 'email', label: 'Email' },
      { key: 'reason', label: 'Reason' },
      { key: 'bannedAt', label: 'Banned At', formatter: formatDate }
    ];
    const banActions = (row) => {
      return `<button class="owner-action-btn" data-action="unban" data-email="${row.email}">Unban</button>`;
    };
    renderTable('ownerBanned', banned, bannedColumns, banActions);
    
    // Attach event listeners
    document.querySelectorAll('[data-action="unban"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const email = e.target.getAttribute('data-email');
        handleUnban(email);
      });
    });
  } catch (error) {
    console.error('Failed to load banned accounts:', error);
  }
}

async function showSuspiciousIPNotification () {
  try {
    const data = await apiGet('/api/owner/notifications');
    if (data.suspiciousIPCount > 0) {
      const notificationArea = document.getElementById('ownerNotifications');
      if (notificationArea) {
        notificationArea.classList.remove('hidden');
        const countEl = document.getElementById('suspiciousIPCount');
        if (countEl) {
          countEl.textContent = data.suspiciousIPCount;
        }
        const listEl = document.getElementById('suspiciousIPList');
        if (listEl && data.suspiciousIPs) {
          listEl.innerHTML = data.suspiciousIPs.map(ip => `
            <div class="suspicious-ip-item">
              <strong>${ip.ip}</strong> - ${ip.accountCount} accounts
              <button class="owner-action-btn" data-action="acknowledge" data-ip="${ip.ip}">Acknowledge</button>
            </div>
          `).join('');
          
          // Attach acknowledge listeners
          document.querySelectorAll('[data-action="acknowledge"]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
              const ip = e.target.getAttribute('data-ip');
              try {
                await apiPost('/api/owner/acknowledge-suspicious-ip', { ip });
                showToast('IP acknowledged', 'success');
                showSuspiciousIPNotification();
              } catch (error) {
                showToast(error.message || 'Failed to acknowledge', 'error');
              }
            });
          });
        }
      }
    }
  } catch (error) {
    console.error('Failed to load notifications:', error);
  }
}

async function hydrateDashboard () {
  try {
    const data = await apiGet('/api/owner/overview');
    document.getElementById('signupCount').textContent = `${data.waitlist.length} total`;
    document.getElementById('loginCount').textContent = `${data.logins.length} recorded`;
    document.getElementById('searchCount').textContent = `${(data.searches || []).length} searches`;
    document.getElementById('upgradeCount').textContent = `${data.upgrades.length} unlocks`;
    
    // Add ban buttons to signups and logins tables
    const signupActions = (row) => {
      return `<button class="owner-action-btn" data-action="ban" data-email="${row.email}">Ban</button>`;
    };
    const loginActions = (row) => {
      return `<button class="owner-action-btn" data-action="ban" data-email="${row.email}">Ban</button>`;
    };
    
    renderTable('ownerSignups', data.waitlist, tableConfig.waitlist, signupActions);
    renderTable('ownerLogins', data.logins, tableConfig.logins, loginActions);
    renderTable('ownerSearches', data.searches || [], tableConfig.searches);
    renderTable('ownerUpgrades', data.upgrades, tableConfig.upgrades);
    
    // Attach ban button listeners
    document.querySelectorAll('[data-action="ban"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const email = e.target.getAttribute('data-email');
        handleBan(email);
      });
    });
    
    // Load banned accounts
    await loadBannedAccounts();
    
    // Show suspicious IP notifications
    await showSuspiciousIPNotification();
  } catch (error) {
    showToast(error.message || 'Owner data unavailable.', 'error');
    document.getElementById('ownerDashboard').innerHTML = `
      <p class="owner-empty">Please sign in with owner credentials.</p>
    `;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  attachGlobalErrorHandler();
  hydrateDashboard();
});

