const fs = require('fs');
const filePath = 'D:/Synexiun/1-SynexFund/HedgeCalc/FXDemo/frontend/src/app/api/market-sectors/route.ts';
let content = fs.readFileSync(filePath, 'utf8');

// Simply add explicit type annotation to FALLBACK_QUOTES
// The interface is defined later (TypeScript hoists interfaces, so this works)
content = content.replace(
  '// Static fallback — updated Feb 2026\nconst FALLBACK_QUOTES = [',
  '// Static fallback — updated Feb 2026\nconst FALLBACK_QUOTES: Array<{symbol:string;name:string;price:number;change:number;changePercent:number;volume:number;category:"market"|"sector";latestTradingDay:string}> = ['
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done - FALLBACK_QUOTES now explicitly typed');
