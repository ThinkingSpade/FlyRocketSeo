import { chromium, expect } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
const out = 'ux-evidence'; await mkdir(out, {recursive:true});
const browser = await chromium.launch();
const context = await browser.newContext({ viewport:{width:1440,height:1000} });
await context.route('**/*', route => ['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
const page = await context.newPage(); const result = {evidence:'Isolated application; fixtures are NOT live SEO findings', snapshots:[], errors:[]};
page.on('pageerror', e=>result.errors.push(String(e)));
async function snapshot(name) {
  result.snapshots.push({name,url:page.url(),...await page.evaluate(()=>({text:document.body.innerText, focused:document.activeElement?.outerHTML, focusParents:[...function*(el){while(el){yield el;el=el.parentElement;}}(document.activeElement)].map(el=>({tag:el.tagName,id:el.id,role:el.getAttribute('role'),class:el.className})), dialogs:[...document.querySelectorAll('[role="dialog"]')].map(el=>({id:el.id,label:el.getAttribute('aria-label'),text:el.innerText.slice(0,500)})), sortHeaders:[...document.querySelectorAll('th')].map(el=>({text:el.innerText,sort:el.getAttribute('aria-sort')}))}))});
  await page.screenshot({path:`${out}/${name}.png`,fullPage:true});
}
try {
  await page.goto('http://127.0.0.1:3101/'); await page.waitForURL(/\/p\/[^/]+/,{timeout:120000}); await page.waitForTimeout(1500);
  const projectId=new URL(page.url()).pathname.split('/')[2];
  await page.goto(`http://127.0.0.1:3101/p/${projectId}/domain?domain=example.com&loc=2840&lang=en&tab=keywords`);
  await page.getByRole('button',{name:'Search',exact:true}).click();
  await page.getByRole('button',{name:/Load keywords/i}).click();
  await page.getByRole('button',{name:'Sort by Volume',exact:true}).waitFor({timeout:30000});
  await snapshot('loaded');
  await page.getByRole('button',{name:'Sort by Volume',exact:true}).click(); await page.waitForTimeout(1000);
  await snapshot('after-sort');
  const load=page.getByRole('button',{name:/Load keywords/i});
  if(await load.isVisible()) {await load.click();await page.waitForTimeout(1000);await snapshot('confirmed-sort');}
  await page.keyboard.press('Control+k'); const input=page.getByRole('combobox',{name:'Search commands'});await input.waitFor();await input.fill('Site Audit');await page.waitForTimeout(300);await snapshot('command-selection');
  await input.press('Enter');await page.waitForTimeout(2000);await snapshot('command-navigation');
  await page.setViewportSize({width:390,height:900});await page.getByRole('button',{name:'Toggle sidebar'}).click();await page.getByRole('dialog',{name:'Navigation',exact:true}).waitFor();
  result.focusSequence=[];
  for(let i=0;i<38;i++) {await page.keyboard.press('Tab');await page.waitForTimeout(40);result.focusSequence.push(await page.evaluate(()=>({tag:document.activeElement?.tagName,text:document.activeElement?.textContent?.slice(0,100),html:document.activeElement?.outerHTML.slice(0,500),inPopup:!!document.getElementById('mobile-navigation')?.contains(document.activeElement),inRole:!!document.activeElement?.closest('[role="dialog"]')})));}
  await page.waitForTimeout(300);await snapshot('mobile-focus');
} catch(error){result.fatal=String(error);await snapshot('fatal').catch(()=>{});}
finally {await writeFile(`${out}/results.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({fatal:result.fatal,errors:result.errors,snapshots:result.snapshots.map(({name,url})=>({name,url})),focusSequence:result.focusSequence},null,2));await browser.close();}
if(result.fatal)process.exitCode=1;
