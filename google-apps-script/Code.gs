// BTC Website — Google Sheets Add-on
// Generates Hugo markdown files and pushes them to GitHub via the Git Tree API.
// One commit per content-type push keeps history clean.

var GITHUB_OWNER = 'kode-monki';
var GITHUB_REPO  = 'btc-hugo';
var API_BASE     = 'https://api.github.com';

// ─── MENU ────────────────────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('BTC Website')
    .addItem('Preview Selected Row(s)', 'previewSelected')
    .addSeparator()
    .addItem('Push Proceedings → Dev',         'pushProceedingsDev')
    .addItem('Push ALL Proceedings → Dev',     'pushAllProceedingsDev')
    .addItem('Push Authors → Dev',             'pushAuthorsDev')
    .addItem('[Debug] Author Image Values',    'debugAuthorImageValues')
    .addItem('[Debug] Push Dry Run',           'debugPushDryRun')
    .addSeparator()
    .addItem('Fill Missing IDs / Slugs',       'fillMissingIds')
    .addItem('Populate Presenters from Proceedings', 'populatePresentersFromProceedings')
    .addItem('Push Sponsors → Dev',            'pushSponsorsDev')
    .addItem('Push Conference Info → Dev',     'pushConferencesDev')
    .addItem('Push ALL → Dev',                 'pushAllDev')
    .addSeparator()
    .addItem('🚀 Push ALL → Production',  'pushAllProduction')
    .addSeparator()
    .addItem('Settings',                  'showSettings')
    .addToUi();
}

// ─── SETTINGS ────────────────────────────────────────────────────────────────

function showSettings() {
  var html = HtmlService.createHtmlOutputFromFile('Settings')
    .setWidth(440).setHeight(320);
  SpreadsheetApp.getUi().showModalDialog(html, 'BTC Website Settings');
}

function saveSettings(pat) {
  PropertiesService.getScriptProperties().setProperty('GITHUB_PAT', pat);
  return 'Settings saved.';
}

function getSettings() {
  var pat = PropertiesService.getScriptProperties().getProperty('GITHUB_PAT') || '';
  return { pat: pat ? '••••••' + pat.slice(-4) : '' };
}

// ─── PREVIEW ─────────────────────────────────────────────────────────────────

function previewSelected() {
  var sheet   = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var range   = sheet.getActiveRange();
  var tabName = sheet.getName().toLowerCase();
  var headers = getHeaders(sheet);
  var rows    = range.getValues();

  var presentersMap = {};
  if (tabName.indexOf('proceeding') !== -1) {
    presentersMap = buildPresentersMap(SpreadsheetApp.getActiveSpreadsheet());
  }

  var previews = [];
  for (var i = 0; i < rows.length; i++) {
    var data = rowToObject(headers, rows[i]);
    if (!hasData(data)) continue;
    var result = generateFile(tabName, data, presentersMap);
    if (result && result.content) previews.push(result);
  }

  if (previews.length === 0) {
    SpreadsheetApp.getUi().alert(
      'No valid rows selected.\n\nMake sure your sheet tab name contains one of:\n' +
      'proceedings, authors, plenaries, sponsors, conferences\n\n' +
      'And that column headers match the expected names.'
    );
    return;
  }

  CacheService.getScriptCache().put('preview_data', JSON.stringify(previews), 120);
  var html = HtmlService.createHtmlOutputFromFile('Preview')
    .setWidth(720).setHeight(540);
  SpreadsheetApp.getUi().showModalDialog(html, 'Markdown Preview (' + previews.length + ' file(s))');
}

function getPreviewData() {
  var cached = CacheService.getScriptCache().get('preview_data');
  return cached ? JSON.parse(cached) : [];
}

// ─── PUSH HANDLERS ───────────────────────────────────────────────────────────

function pushProceedingsDev() {
  var ss      = SpreadsheetApp.getActiveSpreadsheet();
  var sheet   = findSheet(ss, 'proceedings');
  if (!sheet) { SpreadsheetApp.getUi().alert('No sheet tab found matching "proceedings".'); return; }
  var defaultYear = getDefaultYear(sheet, 'year');
  var ui   = SpreadsheetApp.getUi();
  var resp = ui.prompt(
    'Push Proceedings → Dev',
    'Year to push (press OK to use ' + defaultYear + '):',
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var year = resp.getResponseText().trim() || defaultYear;
  pushContentType('proceedings', 'dev', year);
}
function pushAllProceedingsDev() { pushContentType('proceedings', 'dev'); }
function pushAuthorsDev()        { pushContentType('authors',      'dev'); }
function pushSponsorsDev()       { pushContentType('sponsors',     'dev'); }
function pushConferencesDev()    { pushContentType('conferences',  'dev'); }
function pushAllDev()            { pushAll('dev'); }

function debugPushDryRun() {
  var ss     = SpreadsheetApp.getActiveSpreadsheet();
  var active = ss.getActiveSheet();
  var sheet  = (active.getName().toLowerCase().indexOf('author') !== -1)
    ? active : findSheet(ss, 'authors');
  var headers = getHeaders(sheet);
  var allRows = sheet.getDataRange().getValues().slice(1);

  var withImage = [], withoutImage = 0;
  for (var i = 0; i < allRows.length; i++) {
    var data = rowToObject(headers, allRows[i]);
    if (!hasData(data)) continue;
    var file = generateFile('authors', data, {});
    if (!file) continue;
    if (file.content.indexOf('image: ""') === -1) {
      var m = file.content.match(/image: "([^"]+)"/);
      withImage.push((m ? m[1] : '?') + ' → ' + file.path.split('/').pop());
    } else {
      withoutImage++;
    }
  }
  var msg = 'Files with non-empty image: ' + withImage.length + '\n';
  msg += 'Files with image="": ' + withoutImage + '\n\n';
  msg += withImage.slice(0, 15).join('\n');
  SpreadsheetApp.getUi().alert(msg);
}

function debugAuthorImageValues() {
  var ss      = SpreadsheetApp.getActiveSpreadsheet();
  var sheet   = ss.getActiveSheet();
  var headers = getHeaders(sheet);
  var allRows = sheet.getDataRange().getValues();
  var imgIdx  = headers.indexOf('image');
  var msg = 'Sheet: "' + sheet.getName() + '"\n';
  msg += 'Headers (' + headers.length + '): ' + headers.slice(0, 8).join(', ') + '\n';
  msg += 'image col index: ' + imgIdx + '\n';
  msg += 'Total rows (incl header): ' + allRows.length + '\n\n';
  msg += 'Rows with non-empty image:\n';
  var found = 0;
  for (var i = 1; i < allRows.length; i++) {
    var row    = allRows[i];
    var imgVal = imgIdx >= 0 ? row[imgIdx] : '';
    if (imgVal !== '' && imgVal !== null && imgVal !== undefined) {
      var title = row[0] ? row[0].toString().substring(0, 30) : '(empty)';
      msg += '  row ' + (i+1) + ': ' + title + ' → "' + imgVal + '"\n';
      found++;
    }
  }
  if (found === 0) msg += '  (none found)\n';
  SpreadsheetApp.getUi().alert(msg);
}

function pushAllProduction() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.alert(
    'Push to Production',
    'This will overwrite content on the live site (btconference.org).\n\nAre you sure?',
    ui.ButtonSet.YES_NO
  );
  if (resp === ui.Button.YES) pushAll('main');
}

function pushAll(branch) {
  var types = branch === 'main'
    ? ['proceedings', 'authors', 'sponsors']
    : ['proceedings', 'authors', 'sponsors', 'conferences'];
  var totalFiles = 0;
  var errors = [];

  for (var i = 0; i < types.length; i++) {
    var type = types[i];
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = findSheet(ss, type);
    if (!sheet) continue;

    try {
      var count = pushSheetToBranch(sheet, type, branch);
      totalFiles += count;
    } catch (e) {
      errors.push(type + ': ' + e.message);
    }
  }

  if (errors.length) {
    SpreadsheetApp.getUi().alert('Completed with errors:\n' + errors.join('\n'));
  } else {
    SpreadsheetApp.getUi().alert(
      '✓ Pushed ' + totalFiles + ' file(s) to the ' + branch + ' branch.\n\n' +
      (branch === 'dev'
        ? 'To pull locally:\n\ngit fetch origin dev\ngit checkout dev\ngit pull'
        : 'Production deploy triggered via GitHub Actions.')
    );
  }
}

// ─── CORE PUSH LOGIC ─────────────────────────────────────────────────────────

function pushContentType(type, branch, filterYear) {
  var ss     = SpreadsheetApp.getActiveSpreadsheet();
  var active = ss.getActiveSheet();
  var sheet  = (active.getName().toLowerCase().indexOf(type.toLowerCase()) !== -1)
    ? active
    : findSheet(ss, type);
  if (!sheet) {
    SpreadsheetApp.getUi().alert(
      'No sheet tab found matching "' + type + '".\n\n' +
      'Rename your sheet tab so it contains that word (e.g. "Proceedings 2025").'
    );
    return;
  }

  try {
    var count = pushSheetToBranch(sheet, type, branch, filterYear);
    var yearNote = filterYear ? ' (' + filterYear + ')' : '';
    SpreadsheetApp.getUi().alert(
      '✓ Pushed ' + count + ' ' + type + yearNote + ' file(s) to the ' + branch + ' branch.' +
      (branch === 'dev' ? '\n\nTo pull locally:\n\ngit fetch origin dev && git checkout dev && git pull' : '')
    );
  } catch (e) {
    SpreadsheetApp.getUi().alert('Error: ' + e.message);
  }
}

function pushSheetToBranch(sheet, type, branch, filterYear) {
  var headers = getHeaders(sheet);
  var allRows = sheet.getDataRange().getValues().slice(1); // skip header

  var presentersMap = {};
  if (type === 'proceedings') {
    presentersMap = buildPresentersMap(SpreadsheetApp.getActiveSpreadsheet());
  }

  var files         = [];
  var sponsorsByYear = {};

  for (var i = 0; i < allRows.length; i++) {
    var data = rowToObject(headers, allRows[i]);
    if (!hasData(data)) continue;
    if (filterYear && String(data.year || '').trim() !== String(filterYear)) continue;

    var result = generateFile(type, data, presentersMap);
    if (!result) continue;

    if (result.isYaml) {
      // Aggregate sponsors by year — one YAML file per year
      var yr = result.year;
      if (!sponsorsByYear[yr]) sponsorsByYear[yr] = [];
      sponsorsByYear[yr].push(result.data);
    } else {
      files.push(result);
    }
  }

  // Build aggregated sponsor YAML files
  var years = Object.keys(sponsorsByYear);
  for (var j = 0; j < years.length; j++) {
    var year     = years[j];
    var sponsors = sponsorsByYear[year];
    var lines    = sponsors.map(function(s) {
      return (
        '- name: "' + esc(s.name) + '"\n' +
        '  year: ' + s.year + '\n' +
        '  level: "' + esc(s.level) + '"\n' +
        '  website: "' + esc(s.website) + '"\n' +
        '  logo: "' + esc(s.logo) + '"\n' +
        '  description: "' + esc(s.description) + '"'
      );
    });
    files.push({ path: 'data/sponsors/' + year + '.yaml', content: lines.join('\n') });
  }

  if (files.length === 0) return 0;

  commitFiles(files, branch, 'Update ' + type + ' from Google Sheets');
  return files.length;
}

// ─── MARKDOWN GENERATORS ─────────────────────────────────────────────────────

function generateFile(tabName, data, presentersMap) {
  var t = tabName.toLowerCase();
  if (t.indexOf('proceeding') !== -1) return generateProceeding(data, presentersMap || {});
  if (t.indexOf('author')     !== -1) return generateAuthor(data);
  if (t.indexOf('sponsor')    !== -1 || t.indexOf('exhib') !== -1) return generateSponsor(data);
  if (t.indexOf('conference') !== -1) return generateConference(data);
  return null;
}

function generateProceeding(d, presentersMap) {
  var slug = toStr(d.slug) || slugify(d.title || '');
  if (!slug) return null;

  var trackVal = d.track ? '["' + esc(d.track) + '"]' : '[]';

  // Build presenter_ids and author_ids from the Presenters junction table
  var presenterIds = [];
  var authorIds    = [];
  var entries      = (presentersMap && presentersMap[slug]) || [];
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    if (!e.author_id) continue;
    var role = (e.role || '').toLowerCase();
    if (role === 'presenter'       || role === 'author-presenter') presenterIds.push(e.author_id);
    if (role === 'author'          || role === 'author-presenter') authorIds.push(e.author_id);
  }
  var presenterIdsVal = presenterIds.length
    ? '["' + presenterIds.map(function(id) { return esc(id); }).join('", "') + '"]'
    : '[]';
  var authorIdsVal = authorIds.length
    ? '["' + authorIds.map(function(id) { return esc(id); }).join('", "') + '"]'
    : '[]';

  var isPlenary = (d.is_plenary === true || d.is_plenary === 'true' || d.is_plenary === 'TRUE');

  var lines = [
    '---',
    'title: "' + esc(d.title) + '"',
    'date: "' + esc(d.date) + '"',
    'start_time: "' + formatTime(d.start_time) + '"',
    'end_time: "' + formatTime(d.end_time) + '"',
    'publicity: "' + esc(d.publicity) + '"',
    'location: "' + esc(d.location) + '"',
    'author: "' + esc(d.author) + '"',
    'author_id: "' + esc(d.author_id) + '"',
    'year: "' + esc(d.year) + '"',
    'track: ' + trackVal,
    'slides_url: "' + esc(d.slides_url) + '"',
    'paper_url: "' + esc(d.paper_url) + '"',
    'video_url: "' + esc(d.video_url) + '"',
    'is_plenary: ' + (isPlenary ? 'true' : 'false'),
    'lecture: "' + esc(d.lecture) + '"',
    'plenary_weight: ' + (parseInt(d.plenary_weight) || 0),
    'presenter_ids: ' + presenterIdsVal,
    'author_ids: ' + authorIdsVal,
    '---',
    '',
    d.abstract || ''
  ];

  return { path: 'content/english/proceedings/' + slug + '.md', content: lines.join('\n') };
}

function buildPresentersMap(ss) {
  var sheet = findSheet(ss, 'presenter');
  if (!sheet) return {};
  var headers = getHeaders(sheet);
  var rows    = sheet.getDataRange().getValues().slice(1);
  var map     = {};
  for (var i = 0; i < rows.length; i++) {
    var d    = rowToObject(headers, rows[i]);
    var slug = toStr(d.proceeding_slug).toLowerCase().trim();
    if (!slug) continue;
    if (!map[slug]) map[slug] = [];
    map[slug].push({ author_id: toStr(d.author_id), role: toStr(d.role) });
  }
  return map;
}

function generateAuthor(d) {
  var slug = toStr(d.author_id) || slugify(d.title || d.name || '');
  if (!slug) return null;

  var content = [
    '---',
    'title: ' + (d.title || d.name),
    'image: "' + esc(d.image) + '"',
    'description: "' + esc(d.title || d.name) + '"',
    'affiliation: "' + esc(d.affiliation) + '"',
    'author_id: "' + esc(d.author_id || slug) + '"',
    '---',
    '',
    d.bio || ''
  ].join('\n');

  return { path: 'content/english/authors/' + slug + '.md', content: content };
}


function generateSponsor(d) {
  if (!d.year && !d.name) return null;
  // Return a marker; pushSheetToBranch aggregates these into one YAML per year
  return { isYaml: true, year: d.year || 'unknown', data: d };
}

function generateConference(d) {
  var year = d.year || '';
  if (!year) return null;

  var content = [
    '---',
    'title: "' + year + '"',
    'publishDate: ' + year + '-01-01',
    'date_start: ' + (toStr(d.date_start) || ''),
    'date_end: ' + (toStr(d.date_end) || ''),
    'image: "' + esc(d.image) + '"',
    'location: "' + esc(d.location) + '"',
    'status: "' + esc(d.status) + '"',
    'theme: "' + esc(d.theme) + '"',
    'description: "' + esc(d.description) + '"',
    'proceedings_url: "' + esc(d.proceedings_url) + '"',
    'weight: ' + (d.weight || 10),
    'year: ' + year,
    'menu:',
    '  main:',
    '    parent: "conferences"',
    '---',
    '',
    '## Theme',
    '# ' + toStr(d.theme),
    '',
    toStr(d.description),
    '',
    '## Plenaries',
    '',
    '',
    '{{< plenaries year="' + year + '" layout="vertical" >}}'
  ].join('\n');

  return { path: 'content/english/conferences/' + year + '.md', content: content };
}

// ─── GITHUB GIT TREE API — ONE COMMIT PER PUSH ───────────────────────────────

function commitFiles(files, branch, message) {
  var pat = PropertiesService.getScriptProperties().getProperty('GITHUB_PAT');
  if (!pat) throw new Error('GitHub PAT not set. Go to BTC Website > Settings.');

  // 1. Resolve branch HEAD (create dev branch from main if it doesn't exist)
  var refData = githubGet('/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/git/refs/heads/' + branch, pat);
  var latestSha;
  if (refData.status === 404) {
    var mainRef = githubGet('/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/git/refs/heads/main', pat);
    if (mainRef.status === 404) throw new Error('Cannot find main branch in GitHub repo.');
    latestSha = mainRef.object.sha;
    githubPost('/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/git/refs', pat, {
      ref: 'refs/heads/' + branch,
      sha: latestSha
    });
  } else {
    latestSha = refData.object.sha;
  }

  // 2. Get base tree SHA from latest commit
  var commitData = githubGet('/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/git/commits/' + latestSha, pat);
  var baseTreeSha = commitData.tree.sha;

  // 3. Create a blob for each file and build tree items
  var treeItems = [];
  for (var i = 0; i < files.length; i++) {
    var f       = files[i];
    var encoded = Utilities.base64Encode(f.content, Utilities.Charset.UTF_8);
    var blob    = githubPost('/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/git/blobs', pat, {
      content:  encoded,
      encoding: 'base64'
    });
    treeItems.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
  }

  // 4. Create new tree on top of base tree
  var newTree = githubPost('/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/git/trees', pat, {
    base_tree: baseTreeSha,
    tree:      treeItems
  });

  // 5. Create commit
  var newCommit = githubPost('/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/git/commits', pat, {
    message: message,
    tree:    newTree.sha,
    parents: [latestSha]
  });

  // 6. Fast-forward branch ref
  githubPatch('/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/git/refs/heads/' + branch, pat, {
    sha: newCommit.sha
  });
}

// ─── HTTP HELPERS ────────────────────────────────────────────────────────────

function makeHeaders(pat) {
  return {
    'Authorization':        'Bearer ' + pat,
    'Accept':               'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

function githubGet(endpoint, pat) {
  var resp = UrlFetchApp.fetch(API_BASE + endpoint, {
    headers:           makeHeaders(pat),
    muteHttpExceptions: true
  });
  var code = resp.getResponseCode();
  if (code === 404) return { status: 404 };
  if (code >= 400) throw new Error('GitHub GET ' + endpoint + ' → ' + code + ': ' + resp.getContentText());
  return JSON.parse(resp.getContentText());
}

function githubPost(endpoint, pat, body) {
  var resp = UrlFetchApp.fetch(API_BASE + endpoint, {
    method:            'post',
    headers:           makeHeaders(pat),
    contentType:       'application/json',
    payload:           JSON.stringify(body),
    muteHttpExceptions: true
  });
  var code = resp.getResponseCode();
  if (code >= 400) throw new Error('GitHub POST ' + endpoint + ' → ' + code + ': ' + resp.getContentText());
  return JSON.parse(resp.getContentText());
}

function githubPatch(endpoint, pat, body) {
  var resp = UrlFetchApp.fetch(API_BASE + endpoint, {
    method:            'patch',
    headers:           makeHeaders(pat),
    contentType:       'application/json',
    payload:           JSON.stringify(body),
    muteHttpExceptions: true
  });
  var code = resp.getResponseCode();
  if (code >= 400) throw new Error('GitHub PATCH ' + endpoint + ' → ' + code + ': ' + resp.getContentText());
  return JSON.parse(resp.getContentText());
}

// ─── SHEET HELPERS ───────────────────────────────────────────────────────────

function getDefaultYear(sheet, yearCol) {
  var headers = getHeaders(sheet);
  var idx     = headers.indexOf(yearCol);
  if (idx === -1) return '';
  var rows    = sheet.getDataRange().getValues().slice(1);
  var max     = '';
  for (var i = 0; i < rows.length; i++) {
    var y = String(rows[i][idx] || '').trim();
    if (y && y > max) max = y;
  }
  return max;
}

function findSheet(ss, keyword) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().toLowerCase().indexOf(keyword.toLowerCase()) !== -1) {
      return sheets[i];
    }
  }
  return null;
}

function getHeaders(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return [];
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) {
    return h.toString().toLowerCase().trim().replace(/\s+/g, '_');
  });
}

function rowToObject(headers, row) {
  var obj = {};
  for (var i = 0; i < headers.length; i++) {
    obj[headers[i]] = (row[i] !== undefined && row[i] !== null) ? row[i] : '';
  }
  return obj;
}

function hasData(obj) {
  var vals = Object.keys(obj).map(function(k) { return obj[k]; });
  for (var i = 0; i < vals.length; i++) {
    if (vals[i] !== '') return true;
  }
  return false;
}

// ─── UTILITIES ───────────────────────────────────────────────────────────────

function slugify(text) {
  return text.toString().toLowerCase()
    .replace(/[àáâãäå]/g, 'a').replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i').replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u').replace(/[ý]/g, 'y').replace(/[ñ]/g, 'n')
    .replace(/[ç]/g, 'c').replace(/[ß]/g, 'ss')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');
}

function toStr(val) {
  if (val === undefined || val === null || val === '') return '';
  if (val instanceof Date) {
    var y  = val.getFullYear();
    var mo = val.getMonth() + 1;
    var d  = val.getDate();
    return y + '-' + (mo < 10 ? '0' + mo : mo) + '-' + (d < 10 ? '0' + d : d);
  }
  return val.toString().trim();
}

function formatTime(val) {
  if (val === undefined || val === null || val === '') return '';
  if (val instanceof Date) {
    var h    = val.getHours();
    var m    = val.getMinutes();
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + (m < 10 ? '0' + m : m) + ' ' + ampm;
  }
  return val.toString().trim();
}

function esc(val) {
  return toStr(val).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// ─── WEB APP ─────────────────────────────────────────────────────────────────

var CONTENT_DIRS = {
  conferences: 'content/english/conferences',
  proceedings: 'content/english/proceedings',
  plenaries:   'content/english/plenaries',
  authors:     'content/english/authors',
  pages:       'content/english/pages'
};

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('WebApp')
    .setTitle('BTC Website Admin')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ─── ACCESS CONTROL ──────────────────────────────────────────────────────────

function getAllowedEmails() {
  var stored = PropertiesService.getScriptProperties().getProperty('ALLOWED_EMAILS');
  if (!stored) return [];
  try { return JSON.parse(stored); } catch (e) { return []; }
}

function saveAllowedEmails(emails) {
  if (!Array.isArray(emails)) throw new Error('Expected array of emails.');
  PropertiesService.getScriptProperties().setProperty('ALLOWED_EMAILS', JSON.stringify(emails));
  return 'Saved ' + emails.length + ' email(s).';
}

function getCurrentUserEmail() {
  return Session.getActiveUser().getEmail();
}

// ─── ID / SLUG FILL ──────────────────────────────────────────────────────────

function fillMissingIds() {
  var sheet   = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var name    = sheet.getName().toLowerCase();
  var headers = getHeaders(sheet);
  var allRows = sheet.getDataRange().getValues();
  var filled  = 0;

  var isAuthors     = name.indexOf('author') !== -1;
  var isProceedings = name.indexOf('proceeding') !== -1;

  if (!isAuthors && !isProceedings) {
    SpreadsheetApp.getUi().alert('Please run this from the Authors or Proceedings sheet.');
    return;
  }

  if (isAuthors) {
    var idIdx    = headers.indexOf('author_id');
    var titleIdx = headers.indexOf('title');
    var nameIdx  = headers.indexOf('name');
    if (idIdx === -1) { SpreadsheetApp.getUi().alert('No "author_id" column found.'); return; }

    for (var i = 1; i < allRows.length; i++) {
      var row = allRows[i];
      if (toStr(row[idIdx])) continue; // already has an ID
      var source = toStr(titleIdx >= 0 ? row[titleIdx] : '') ||
                   toStr(nameIdx  >= 0 ? row[nameIdx]  : '');
      if (!source) continue;
      var slug = slugify(source);
      if (!slug) continue;
      sheet.getRange(i + 1, idIdx + 1).setValue(slug);
      filled++;
    }
    SpreadsheetApp.getUi().alert('Filled ' + filled + ' missing author_id value(s).');
  }

  if (isProceedings) {
    var slugIdx  = headers.indexOf('slug');
    var titleIdx = headers.indexOf('title');
    if (slugIdx === -1) { SpreadsheetApp.getUi().alert('No "slug" column found.'); return; }

    for (var i = 1; i < allRows.length; i++) {
      var row = allRows[i];
      if (toStr(row[slugIdx])) continue; // already has a slug
      var title = toStr(titleIdx >= 0 ? row[titleIdx] : '');
      if (!title) continue;
      var slug = slugify(title);
      if (!slug) continue;
      sheet.getRange(i + 1, slugIdx + 1).setValue(slug);
      filled++;
    }
    SpreadsheetApp.getUi().alert('Filled ' + filled + ' missing slug value(s).');
  }
}

function populatePresentersFromProceedings() {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var ui   = SpreadsheetApp.getUi();

  var procSheet = findSheet(ss, 'proceeding');
  if (!procSheet) { ui.alert('No sheet tab found matching "proceedings".'); return; }

  var headers  = getHeaders(procSheet);
  var slugIdx  = headers.indexOf('slug');
  var titleIdx = headers.indexOf('title');
  var authIdx  = headers.indexOf('author_id');
  if (authIdx === -1) { ui.alert('No "author_id" column found in Proceedings sheet.'); return; }

  var allRows = procSheet.getDataRange().getValues().slice(1);

  // Find or create Presenters sheet
  var presSheet = findSheet(ss, 'presenter');
  if (!presSheet) {
    presSheet = ss.insertSheet('Presenters');
    presSheet.getRange(1, 1, 1, 3).setValues([['proceeding_slug', 'author_id', 'role']]);
    presSheet.getRange(1, 1, 1, 3).setFontWeight('bold');
  }

  // Build set of existing entries to avoid duplicates
  var existingData = presSheet.getDataRange().getValues().slice(1);
  var existing     = {};
  for (var i = 0; i < existingData.length; i++) {
    var key = toStr(existingData[i][0]) + '||' + toStr(existingData[i][1]);
    if (key !== '||') existing[key] = true;
  }

  var newRows = [];
  for (var i = 0; i < allRows.length; i++) {
    var row      = allRows[i];
    var authorId = toStr(authIdx >= 0 ? row[authIdx] : '');
    if (!authorId) continue;

    var procSlug = toStr(slugIdx >= 0 ? row[slugIdx] : '') ||
                   slugify(toStr(titleIdx >= 0 ? row[titleIdx] : ''));
    if (!procSlug) continue;

    var key = procSlug + '||' + authorId;
    if (existing[key]) continue;
    newRows.push([procSlug, authorId, 'author-presenter']);
    existing[key] = true;
  }

  if (newRows.length > 0) {
    var lastRow = presSheet.getLastRow();
    presSheet.getRange(lastRow + 1, 1, newRows.length, 3).setValues(newRows);
  }

  ui.alert('Done. Added ' + newRows.length + ' new row(s) to the Presenters sheet.');
}

// ─── SHEET SYNC ──────────────────────────────────────────────────────────────

function getSheetId() {
  return PropertiesService.getScriptProperties().getProperty('SHEET_ID') || '';
}

function saveSheetId(id) {
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', (id || '').trim());
  return 'Sheet ID saved.';
}

function getLinkedSpreadsheet() {
  var id = getSheetId();
  if (!id) return null;
  try { return SpreadsheetApp.openById(id); } catch (e) { return null; }
}

function syncRowToSheet(type, data, keyField) {
  var ss = getLinkedSpreadsheet();
  if (!ss) return;
  var sheet = findSheet(ss, type);
  if (!sheet) return;

  var headers = getHeaders(sheet);
  var keyIdx  = headers.indexOf(keyField);
  if (keyIdx === -1) return;

  var keyVal  = toStr(data[keyField] || '').toLowerCase();
  var allRows = sheet.getDataRange().getValues();
  var values  = headers.map(function (h) { return data[h] !== undefined ? data[h] : ''; });

  for (var i = 1; i < allRows.length; i++) {
    if (toStr(allRows[i][keyIdx]).toLowerCase() === keyVal) {
      sheet.getRange(i + 1, 1, 1, values.length).setValues([values]);
      return;
    }
  }
  sheet.appendRow(values);
}

// ─── GITHUB READ FUNCTIONS ────────────────────────────────────────────────────

function listContentFiles(type) {
  var pat = PropertiesService.getScriptProperties().getProperty('GITHUB_PAT');
  if (!pat) throw new Error('GitHub PAT not set. Go to Settings.');

  if (type === 'sponsors') {
    var resp = githubGet('/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO +
                         '/contents/data/sponsors?ref=main', pat);
    if (resp.status === 404 || !Array.isArray(resp)) return [];
    return resp
      .filter(function (f) { return f.type === 'file' && /\.ya?ml$/.test(f.name); })
      .map(function (f) { return { name: f.name, path: f.path, sha: f.sha }; })
      .sort(function (a, b) { return b.name.localeCompare(a.name); });
  }

  var dir = CONTENT_DIRS[type];
  if (!dir) throw new Error('Unknown content type: ' + type);
  var resp = githubGet('/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO +
                       '/contents/' + dir + '?ref=main', pat);
  if (resp.status === 404 || !Array.isArray(resp)) return [];
  var files = resp
    .filter(function (f) { return f.type === 'file' && f.name !== '_index.md'; })
    .map(function (f) { return { name: f.name, path: f.path, sha: f.sha }; });
  var dirs = resp
    .filter(function (f) { return f.type === 'dir'; })
    .map(function (f) { return { name: f.name + '.md', path: f.path + '/_index.md', sha: f.sha }; });
  return files.concat(dirs)
    .sort(function (a, b) { return a.name.localeCompare(b.name); });
}

function getContentFile(filePath) {
  var pat = PropertiesService.getScriptProperties().getProperty('GITHUB_PAT');
  if (!pat) throw new Error('GitHub PAT not set. Go to Settings.');
  var resp = githubGet('/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO +
                       '/contents/' + filePath + '?ref=main', pat);
  if (resp.status === 404 || !resp.content) throw new Error('File not found: ' + filePath);
  return Utilities.newBlob(
    Utilities.base64Decode(resp.content.replace(/\n/g, ''))
  ).getDataAsString();
}

// ─── WEB SAVE WRAPPERS ────────────────────────────────────────────────────────

function webSaveConference(data, branch) {
  branch = branch || 'dev';
  var file = generateConference(data);
  if (!file) throw new Error('Year is required.');

  // If editing a branch bundle (_index.md), preserve the existing body
  var currentPath = data._currentPath || '';
  if (currentPath.indexOf('/_index.md') !== -1) {
    var bundlePath   = 'content/english/conferences/' + data.year + '/_index.md';
    var existing     = '';
    try { existing = getContentFile(currentPath); } catch (e) {}
    var existingBody = existing ? existing.replace(/^---[\s\S]*?\n---\n?/, '') : '';
    var fmEnd        = file.content.indexOf('\n---\n');
    file = { path: bundlePath, content: file.content.substring(0, fmEnd + 5) + '\n' + existingBody };
  }

  commitFiles([file], branch, 'Update conference (' + (data.year || '') + ') via web CMS');
  syncRowToSheet('conferences', data, 'year');
  return file.path;
}


function webSaveAuthor(data, branch) {
  branch = branch || 'dev';
  data.bio = data.bio || data.body || '';
  var file = generateAuthor(data);
  if (!file) throw new Error('Author name is required.');
  commitFiles([file], branch, 'Update author (' + (data.title || '') + ') via web CMS');
  syncRowToSheet('authors', data, 'author_id');
  return file.path;
}

function webSaveProceeding(data, branch) {
  branch = branch || 'dev';
  data.abstract = data.abstract || data.body || '';
  var file = generateProceeding(data);
  if (!file) throw new Error('Title is required.');
  commitFiles([file], branch, 'Update proceeding (' + (data.title || '') + ') via web CMS');
  return file.path;
}

function webSaveSponsor(data, branch) {
  branch = branch || 'dev';
  var year = String(data.year || '');
  if (!year || !data.name) throw new Error('Sponsor name and year are required.');
  var sponsorPath = 'data/sponsors/' + year + '.yaml';

  var existing = [];
  try {
    existing = parseSponsorYaml(getContentFile(sponsorPath));
  } catch (e) {}

  var found = false;
  for (var i = 0; i < existing.length; i++) {
    if ((existing[i].name || '').toLowerCase() === data.name.toLowerCase()) {
      existing[i] = data;
      found = true;
      break;
    }
  }
  if (!found) existing.push(data);

  var lines = existing.map(function (s) {
    return (
      '- name: "' + esc(s.name || '') + '"\n' +
      '  year: ' + (s.year || year) + '\n' +
      '  level: "' + esc(s.level || '') + '"\n' +
      '  website: "' + esc(s.website || '') + '"\n' +
      '  logo: "' + esc(s.logo || '') + '"\n' +
      '  description: "' + esc(s.description || '') + '"'
    );
  });

  commitFiles([{ path: sponsorPath, content: lines.join('\n') }], branch,
              'Update sponsors (' + year + ') via web CMS');
  syncRowToSheet('sponsors', data, 'name');
  return sponsorPath;
}

function parseSponsorYaml(content) {
  var sponsors = [], current = null;
  content.split('\n').forEach(function (line) {
    var t = line.trim();
    if (!t) return;
    if (t.startsWith('- name:')) {
      if (current) sponsors.push(current);
      current = { name: t.replace(/^-\s*name:\s*["']?(.*?)["']?\s*$/, '$1') };
    } else if (current) {
      var m = t.match(/^(\w+):\s*["']?(.*?)["']?\s*$/);
      if (m) current[m[1]] = m[2];
    }
  });
  if (current) sponsors.push(current);
  return sponsors;
}

function webSavePage(data, branch) {
  branch = branch || 'dev';
  var slug = slugify(data.title || '');
  if (!slug) throw new Error('Title is required.');
  var content = [
    '---',
    'title: "' + esc(data.title) + '"',
    'date: "' + esc(data.date || toStr(new Date())) + '"',
    'description: "' + esc(data.description || '') + '"',
    'draft: ' + (data.draft ? 'true' : 'false'),
    '---',
    '',
    data.body || ''
  ].join('\n');
  commitFiles([{ path: 'content/english/pages/' + slug + '.md', content: content }],
              branch, 'Update page (' + data.title + ') via web CMS');
  return 'content/english/pages/' + slug + '.md';
}

function getWebAppSettings() {
  var pat = PropertiesService.getScriptProperties().getProperty('GITHUB_PAT') || '';
  return {
    pat:     pat ? '••••' + pat.slice(-4) : '(not set)',
    sheetId: getSheetId(),
    emails:  getAllowedEmails()
  };
}

// ─── RICH LIST WITH METADATA ─────────────────────────────────────────────────

// Fetches file metadata in batches of 10 to avoid UrlFetch rate limits.
function listContentFilesWithMeta(type) {
  var pat = PropertiesService.getScriptProperties().getProperty('GITHUB_PAT');
  if (!pat) throw new Error('GitHub PAT not set. Go to Settings.');

  var files = listContentFiles(type);
  if (!files.length) return [];

  var BATCH   = 10;
  var results = [];

  for (var b = 0; b < files.length; b += BATCH) {
    if (b > 0) Utilities.sleep(1000);
    var batch    = files.slice(b, b + BATCH);
    var requests = batch.map(function (f) {
      return {
        url: API_BASE + '/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO +
             '/contents/' + f.path + '?ref=main',
        headers: makeHeaders(pat),
        muteHttpExceptions: true
      };
    });
    var responses = UrlFetchApp.fetchAll(requests);
    batch.forEach(function (f, i) {
      var fm = {};
      try {
        if (responses[i].getResponseCode() === 200) {
          var data = JSON.parse(responses[i].getContentText());
          if (data.content) {
            var decoded = Utilities.newBlob(
              Utilities.base64Decode(data.content.replace(/\n/g, ''))
            ).getDataAsString();
            var fmMatch = decoded.match(/^---\n([\s\S]*?)\n---/);
            if (fmMatch) fm = parseSimpleYaml(fmMatch[1]);
          }
        }
      } catch (e) {}
      results.push({ name: f.name, path: f.path, fm: fm });
    });
  }
  return results;
}

// Minimal YAML key:value parser — handles the flat scalar fields we need.
// Skips multiline blocks (| and >) and nested keys.
function parseSimpleYaml(text) {
  var result = {};
  text.split('\n').forEach(function (line) {
    var m = line.match(/^([\w_]+):\s*(.*?)\s*$/);
    if (!m) return;
    var v = m[2].replace(/^["'](.*)["']$/, '$1').trim();
    if (v !== '|' && v !== '>') result[m[1]] = v;
  });
  return result;
}
