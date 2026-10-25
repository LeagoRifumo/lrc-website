import json, urllib.request, gzip, re
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
def get(u, h=None):
    r = urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': UA, 'Accept-Encoding': 'gzip', **(h or {})}), timeout=25)
    b = r.read(); return gzip.decompress(b) if r.headers.get('Content-Encoding') == 'gzip' else b
def t(n, f):
    try: print('OK  ', n, '|', str(f())[:500])
    except Exception as e: print('FAIL', n, '|', repr(e)[:200])
t('yahoo rss AAPL', lambda: re.findall(r'<title>(.*?)</title>', get('https://feeds.finance.yahoo.com/rss/2.0/headline?s=AAPL&region=US&lang=en-US').decode())[:4])
t('yahoo rss NPN.JO', lambda: re.findall(r'<title>(.*?)</title>', get('https://feeds.finance.yahoo.com/rss/2.0/headline?s=NPN.JO&region=US&lang=en-US').decode())[:4])
t('google news Naspers', lambda: re.findall(r'<title>(.*?)</title>', get('https://news.google.com/rss/search?q=%22Naspers%22+when:14d&hl=en-ZA&gl=ZA&ceid=ZA:en').decode())[:5])
t('google news Capitec SENS', lambda: re.findall(r'<title>(.*?)</title>', get('https://news.google.com/rss/search?q=Capitec+JSE+when:14d&hl=en-ZA&gl=ZA&ceid=ZA:en').decode())[:5])
SECH = {'User-Agent': 'Leago Rifumo Capital research info@leagorifumocapital.co.za'}
t('sec tickers', lambda: list(json.loads(get('https://www.sec.gov/files/company_tickers.json', SECH)).values())[:2])
t('sec submissions AAPL', lambda: (lambda j: list(zip(j['filings']['recent']['form'][:8], j['filings']['recent']['filingDate'][:8], j['filings']['recent']['primaryDocDescription'][:8])))(json.loads(get('https://data.sec.gov/submissions/CIK0000320193.json', SECH))))
t('sec companyfacts AAPL', lambda: (lambda j: [(k, len(v['units'].get('USD', []))) for k, v in j['facts']['us-gaap'].items() if k in ('Revenues','RevenueFromContractWithCustomerExcludingAssessedTax','NetIncomeLoss','NetCashProvidedByUsedInOperatingActivities','PaymentsToAcquirePropertyPlantAndEquipment')])(json.loads(get('https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json', SECH))))
t('nasdaq news AAPL', lambda: json.loads(get('https://api.nasdaq.com/api/news/topic/articlebysymbol?q=aapl|stocks&offset=0&limit=3', {'Accept':'application/json','Origin':'https://www.nasdaq.com','Referer':'https://www.nasdaq.com/'}))['data']['rows'][:2])
t('moneyweb sens rss', lambda: re.findall(r'<title>(.*?)</title>', get('https://www.moneyweb.co.za/feed/?post_type=sens').decode())[:4])
t('jse sens via sharenet', lambda: get('https://www.sharenet.co.za/v3/sens.php')[:200])
