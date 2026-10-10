/**
 * flags.js v2 — full-world flag helper for Zamil SMS dashboard
 * FIXES: valid flagcdn sizes (w24 doesn't exist → broken images),
 * emoji auto-fallback on image error, 230+ calling codes,
 * country-name → ISO resolver, universal getFlag().
 */
(function (global) {
  'use strict';

  // ── Calling code → ISO (longest match wins) ───────────────
  const CALLING_CODE_TO_ISO = {
    '1':'US','7':'RU','20':'EG','27':'ZA','30':'GR','31':'NL','32':'BE','33':'FR','34':'ES','39':'IT',
    '40':'RO','41':'CH','44':'GB','45':'DK','46':'SE','47':'NO','48':'PL','49':'DE','51':'PE','52':'MX',
    '53':'CU','54':'AR','55':'BR','56':'CL','57':'CO','58':'VE','60':'MY','61':'AU','62':'ID','63':'PH',
    '64':'NZ','65':'SG','66':'TH','81':'JP','82':'KR','84':'VN','86':'CN','90':'TR','91':'IN','92':'PK',
    '93':'AF','94':'LK','95':'MM','98':'IR','211':'SS','212':'MA','213':'DZ','216':'TN','218':'LY',
    '220':'GM','221':'SN','222':'MR','223':'ML','224':'GN','225':'CI','226':'BF','227':'NE','228':'TG',
    '229':'BJ','230':'MU','231':'LR','232':'SL','233':'GH','234':'NG','235':'TD','236':'CF','237':'CM',
    '238':'CV','239':'ST','240':'GQ','241':'GA','242':'CG','243':'CD','244':'AO','245':'GW','248':'SC',
    '249':'SD','250':'RW','251':'ET','252':'SO','253':'DJ','254':'KE','255':'TZ','256':'UG','257':'BI',
    '258':'MZ','260':'ZM','261':'MG','262':'RE','263':'ZW','264':'NA','265':'MW','266':'LS','267':'BW',
    '268':'SZ','269':'KM','290':'SH','291':'ER','297':'AW','350':'GI','351':'PT','352':'LU','353':'IE',
    '354':'IS','355':'AL','356':'MT','357':'CY','358':'FI','359':'BG','370':'LT','371':'LV','372':'EE',
    '373':'MD','374':'AM','375':'BY','376':'AD','377':'MC','378':'SM','380':'UA','381':'RS','382':'ME',
    '383':'XK','385':'HR','386':'SI','387':'BA','389':'MK','420':'CZ','421':'SK','423':'LI','500':'FK',
    '501':'BZ','502':'GT','503':'SV','504':'HN','505':'NI','506':'CR','507':'PA','508':'PM','509':'HT',
    '590':'GP','591':'BO','592':'GY','593':'EC','594':'GF','595':'PY','596':'MQ','597':'SR','598':'UY',
    '599':'CW','670':'TL','672':'NF','673':'BN','674':'NR','675':'PG','676':'TO','677':'SB','678':'VU',
    '679':'FJ','680':'PW','681':'WF','682':'CK','683':'NU','685':'WS','686':'KI','687':'NC','688':'TV',
    '689':'PF','690':'TK','691':'FM','692':'MH','850':'KP','852':'HK','853':'MO','855':'KH','856':'LA',
    '880':'BD','886':'TW','960':'MV','961':'LB','962':'JO','963':'SY','964':'IQ','965':'KW','966':'SA',
    '967':'YE','968':'OM','970':'PS','971':'AE','972':'IL','973':'BH','974':'QA','975':'BT','976':'MN',
    '977':'NP','992':'TJ','993':'TM','994':'AZ','995':'GE','996':'KG','998':'UZ',
    // NANP islands (4-digit)
    '1242':'BS','1246':'BB','1264':'AI','1268':'AG','1284':'VG','1340':'VI','1345':'KY','1441':'BM',
    '1473':'GD','1649':'TC','1664':'MS','1670':'MP','1671':'GU','1684':'AS','1721':'SX','1758':'LC',
    '1767':'DM','1784':'VC','1809':'DO','1829':'DO','1849':'DO','1868':'TT','1869':'KN','1876':'JM','1939':'PR'
  };

  // ── Country name → ISO ────────────────────────────────────
  const NAME_TO_ISO = {
    'afghanistan':'AF','albania':'AL','algeria':'DZ','andorra':'AD','angola':'AO','anguilla':'AI',
    'antigua':'AG','argentina':'AR','armenia':'AM','aruba':'AW','australia':'AU','austria':'AT',
    'azerbaijan':'AZ','bahamas':'BS','bahrain':'BH','bangladesh':'BD','barbados':'BB','belarus':'BY',
    'belgium':'BE','belize':'BZ','benin':'BJ','bermuda':'BM','bhutan':'BT','bolivia':'BO','bosnia':'BA',
    'botswana':'BW','brazil':'BR','brunei':'BN','bulgaria':'BG','burkina':'BF','burkina faso':'BF',
    'burundi':'BI','burma':'MM','cambodia':'KH','cameroon':'CM','canada':'CA','cape verde':'CV',
    'cayman':'KY','central african':'CF','chad':'TD','chile':'CL','china':'CN','colombia':'CO',
    'comoros':'KM','congo':'CG','costa rica':'CR','croatia':'HR','cuba':'CU','cyprus':'CY',
    'czech':'CZ','czechia':'CZ','czech republic':'CZ','denmark':'DK','djibouti':'DJ','dominica':'DM',
    'dominican':'DO','dr congo':'CD','ecuador':'EC','egypt':'EG','el salvador':'SV','equatorial guinea':'GQ',
    'eritrea':'ER','estonia':'EE','eswatini':'SZ','ethiopia':'ET','fiji':'FJ','finland':'FI','france':'FR',
    'gabon':'GA','gambia':'GM','georgia':'GE','germany':'DE','ghana':'GH','greece':'GR','grenada':'GD',
    'guatemala':'GT','guinea':'GN','guinea bissau':'GW','guyana':'GY','haiti':'HT','honduras':'HN',
    'hong kong':'HK','hongkong':'HK','hungary':'HU','iceland':'IS','india':'IN','indonesia':'ID',
    'iran':'IR','iraq':'IQ','ireland':'IE','israel':'IL','italy':'IT','ivory coast':'CI','jamaica':'JM',
    'japan':'JP','jordan':'JO','kazakhstan':'KZ','kenya':'KE','korea':'KR','kosovo':'XK','kuwait':'KW',
    'kyrgyzstan':'KG','laos':'LA','latvia':'LV','lebanon':'LB','lesotho':'LS','liberia':'LR','libya':'LY',
    'lithuania':'LT','luxembourg':'LU','macau':'MO','macao':'MO','madagascar':'MG','malawi':'MW',
    'malaysia':'MY','maldives':'MV','mali':'ML','malta':'MT','mauritania':'MR','mauritius':'MU',
    'mexico':'MX','moldova':'MD','monaco':'MC','mongolia':'MN','montenegro':'ME','morocco':'MA',
    'mozambique':'MZ','myanmar':'MM','namibia':'NA','nepal':'NP','netherlands':'NL','new zealand':'NZ',
    'nicaragua':'NI','niger':'NE','nigeria':'NG','north korea':'KP','north macedonia':'MK','norway':'NO',
    'oman':'OM','pakistan':'PK','palestine':'PS','panama':'PA','papua new guinea':'PG','paraguay':'PY',
    'peru':'PE','philippines':'PH','poland':'PL','portugal':'PT','qatar':'QA','romania':'RO','russia':'RU',
    'rwanda':'RW','saudi':'SA','saudi arabia':'SA','senegal':'SN','serbia':'RS','seychelles':'SC',
    'sierra leone':'SL','singapore':'SG','slovakia':'SK','slovenia':'SI','somalia':'SO','south africa':'ZA',
    'south korea':'KR','south sudan':'SS','spain':'ES','sri lanka':'LK','srilanka':'LK','sudan':'SD',
    'swaziland':'SZ','sweden':'SE','switzerland':'CH','syria':'SY','taiwan':'TW','tajikistan':'TJ',
    'tanzania':'TZ','thailand':'TH','timor leste':'TL','togo':'TG','trinidad':'TT','tunisia':'TN',
    'turkey':'TR','turkmenistan':'TM','uae':'AE','uganda':'UG','uk':'GB','ukraine':'UA',
    'united arab emirates':'AE','united kingdom':'GB','united states':'US','uruguay':'UY','us':'US',
    'usa':'US','uzbekistan':'UZ','vanuatu':'VU','venezuela':'VE','vietnam':'VN','yemen':'YE',
    'zaire':'CD','zambia':'ZM','zimbabwe':'ZW'
  };

  const VALID_SIZES = [20, 40, 80, 160, 320, 640]; // flagcdn ONLY serves these

  function callingCodeToISO(code) {
    if (!code) return null;
    const digits = String(code).replace(/[^0-9]/g, '');
    if (!digits) return null;
    for (const len of [4, 3, 2, 1]) {
      const c = digits.slice(0, len);
      if (CALLING_CODE_TO_ISO[c]) return CALLING_CODE_TO_ISO[c];
    }
    return null;
  }

  function getFlagEmoji(iso) {
    if (!iso || iso.length !== 2) return '🌐';
    return String.fromCodePoint(...[...iso.toUpperCase()].map(c => 127397 + c.charCodeAt(0)));
  }

  function _size(w) {
    w = parseInt(w, 10) || 24;
    let best = VALID_SIZES[0];
    for (const s of VALID_SIZES) if (s <= w) best = s;
    return best; // never request a non-existent size again
  }

  function getFlagImgHTML(iso, size) {
    iso = (iso || '').toUpperCase();
    if (iso.length !== 2) return '<span aria-hidden="true">🌐</span>';
    const w = _size(size), code = iso.toLowerCase();
    // If the image ever fails (offline/blocked), swap to emoji instantly
    const fb = '<span style=&quot;font-size:1.2rem;line-height:1&quot;>' + getFlagEmoji(iso) + '</span>';
    return '<img src="https://flagcdn.com/w' + w + '/' + code + '.png"' +
      ' srcset="https://flagcdn.com/w' + (w * 2) + '/' + code + '.png 2x"' +
      ' alt="' + iso + '" width="' + w + '" loading="lazy" decoding="async"' +
      ' style="border-radius:4px;vertical-align:middle"' +
      ' onerror="this.outerHTML=\'' + fb + '\'">';
  }

  // Accepts ISO ('PK'), calling code ('92' / '+92' / '92300…'), or name ('Pakistan')
  function isoFromAny(x) {
    if (!x) return null;
    const s = String(x).trim();
    if (!s) return null;
    if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
    if (/^[+0-9]/.test(s)) { const iso = callingCodeToISO(s); if (iso) return iso; }
    const key = s.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (NAME_TO_ISO[key]) return NAME_TO_ISO[key];
    for (const name in NAME_TO_ISO) {
      if (key.indexOf(name) === 0) return NAME_TO_ISO[name];
    }
    return null;
  }

  function getFlag(x, size) {
    const iso = isoFromAny(x);
    return iso ? getFlagImgHTML(iso, size || 24) : '<span aria-hidden="true">🌐</span>';
  }

  global.callingCodeToISO = callingCodeToISO;
  global.getFlagEmoji = getFlagEmoji;
  global.getFlagImgHTML = getFlagImgHTML;
  global.isoFromAny = isoFromAny;
  global.getFlag = getFlag;
})(window);
