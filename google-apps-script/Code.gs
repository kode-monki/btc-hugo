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
    .addItem('Push Proceedings → Dev',    'pushProceedingsDev')
    .addItem('Push Authors → Dev',        'pushAuthorsDev')
    .addItem('Push Plenaries → Dev',      'pushPlenariesDev')
    .addItem('Push Sponsors → Dev',       'pushSponsorsDev')
    .addItem('Push Conference Info → Dev','pushConferencesDev')
    .addItem('Push ALL → Dev',            'pushAllDev')
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

  var previews = [];
  for (var i = 0; i < rows.length; i++) {
    var data = rowToObject(headers, rows[i]);
    if (!hasData(data)) continue;
    var result = generateFile(tabName, data);
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

function pushProceedingsDev()  { pushContentType('proceedings',  'dev'); }
function pushAuthorsDev()      { pushContentType('authors',      'dev'); }
function pushPlenariesDev()    { pushContentType('plenaries',    'dev'); }
function pushSponsorsDev()     { pushContentType('sponsors',     'dev'); }
function pushConferencesDev()  { pushContentType('conferences',  'dev'); }
function pushAllDev()          { pushAll('dev'); }

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
    ? ['proceedings', 'authors', 'plenaries', 'sponsors']
    : ['proceedings', 'authors', 'plenaries', 'sponsors', 'conferences'];
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

function pushContentType(type, branch) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = findSheet(ss, type);
  if (!sheet) {
    SpreadsheetApp.getUi().alert(
      'No sheet tab found matching "' + type + '".\n\n' +
      'Rename your sheet tab so it contains that word (e.g. "Proceedings 2025").'
    );
    return;
  }

  try {
    var count = pushSheetToBranch(sheet, type, branch);
    SpreadsheetApp.getUi().alert(
      '✓ Pushed ' + count + ' ' + type + ' file(s) to the ' + branch + ' branch.' +
      (branch === 'dev' ? '\n\nTo pull locally:\n\ngit fetch origin dev && git checkout dev && git pull' : '')
    );
  } catch (e) {
    SpreadsheetApp.getUi().alert('Error: ' + e.message);
  }
}

function pushSheetToBranch(sheet, type, branch) {
  var headers = getHeaders(sheet);
  var allRows = sheet.getDataRange().getValues().slice(1); // skip header

  var files         = [];
  var sponsorsByYear = {};

  for (var i = 0; i < allRows.length; i++) {
    var data = rowToObject(headers, allRows[i]);
    if (!hasData(data)) continue;

    var result = generateFile(type, data);
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

function generateFile(tabName, data) {
  var t = tabName.toLowerCase();
  if (t.indexOf('proceeding') !== -1) return generateProceeding(data);
  if (t.indexOf('author')     !== -1) return generateAuthor(data);
  if (t.indexOf('plenar')     !== -1) return generatePlenary(data);
  if (t.indexOf('sponsor')    !== -1 || t.indexOf('exhib') !== -1) return generateSponsor(data);
  if (t.indexOf('conference') !== -1) return generateConference(data);
  return null;
}

function generateProceeding(d) {
  var slug = slugify(d.title || '');
  if (!slug) return null;

  var trackVal = d.track ? '["' + esc(d.track) + '"]' : '[]';
  var content = [
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
    '---',
    '',
    d.abstract || ''
  ].join('\n');

  return { path: 'content/english/proceedings/' + slug + '.md', content: content };
}

function generateAuthor(d) {
  var slug = slugify(d.title || d.name || '');
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

function generatePlenary(d) {
  var slug = slugify(d.author_id || d.author || '');
  if (!slug) return null;

  var affLines = (d.affiliation || '').split(/\n|\r\n?/).map(function(l) { return '  ' + l; }).join('\n');
  var authorLink = '/authors/' + slugify(d.author_id || d.author) + '/';

  var content = [
    '---',
    'title: "' + esc(d.title) + '"',
    'year: ' + (d.year || ''),
    'affiliation: |',
    affLines,
    'lecture: "' + esc(d.lecture) + '"',
    'image: "' + esc(d.image) + '"',
    'author: "' + esc(d.author) + '"',
    'author_link: "' + authorLink + '"',
    'plenary_id: "' + slug + '"',
    'weight: ' + (d.weight || 1),
    '---',
    '',
    d.abstract || ''
  ].join('\n');

  return { path: 'content/english/plenaries/' + slug + '.md', content: content };
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
