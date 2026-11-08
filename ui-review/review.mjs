import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.dirname(new URL(import.meta.url).pathname);
const out = path.join(root, 'screenshots', process.env.PHASE || 'before');
await fs.mkdir(out,{recursive:true});
const browser = await chromium.launch({headless:true, executablePath:'/usr/bin/google-chrome', args:['--no-sandbox']});
const roles = [['owner','owner@demo.remit.ng'],['admin','admin@demo.remit.ng'],['finance','finance@demo.remit.ng'],['viewer','viewer@demo.remit.ng']];
const routeLabels = ['Dashboard','Employees','Wallet','Payroll','Transactions','Alerts','Support','Settings'];
const outLines=[];
for (const [role,email] of roles) {
 const context = await browser.newContext({viewport:{width:1440,height:1000}}); const page = await context.newPage();
 const consoleErrors=[]; const failed=[]; page.on('console',m=>{if(m.type()==='error') consoleErrors.push(m.text())}); page.on('requestfailed',r=>failed.push(`${r.method()} ${r.url()} :: ${r.failure()?.errorText}`));
 let loggedIn=false; let navSeen=[]; let error='';
 try {
  await page.goto('http://localhost:5173'); await page.getByRole('button',{name:'Sign in',exact:true}).first().click();
  await page.getByLabel('Work email').fill(email); await page.locator('input[type=password]').first().fill('RemitDemo2026'); await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.waitForTimeout(1200); loggedIn=await page.getByRole('navigation',{name:'Operations navigation'}).count()>0;
  await page.screenshot({path:path.join(out,`web-${role}-dashboard.png`),fullPage:true});
  for (const label of routeLabels) {
   const nav = page.getByRole('navigation',{name:'Operations navigation'}).getByRole('button',{name:label,exact:true});
   if (await nav.count() && await nav.isVisible()) { await nav.click(); await page.waitForTimeout(650); navSeen.push(label); await page.screenshot({path:path.join(out,`web-${role}-${label.toLowerCase()}.png`),fullPage:true}); }
  }
  await page.reload(); await page.waitForTimeout(1000); loggedIn = loggedIn && (await page.getByRole('navigation',{name:'Operations navigation'}).count()>0);
 } catch (e) { error=String(e); }
 outLines.push(JSON.stringify({phase:process.env.PHASE||'before',app:'web',role,consoleErrors,failed,loggedIn,navSeen,error})); await context.close();
}
{
 const context = await browser.newContext({viewport:{width:390,height:844},screen:{width:390,height:844},isMobile:true,hasTouch:true}); const page = await context.newPage(); const consoleErrors=[]; const failed=[]; page.on('console',m=>{if(m.type()==='error') consoleErrors.push(m.text())}); page.on('requestfailed',r=>failed.push(`${r.method()} ${r.url()} :: ${r.failure()?.errorText}`)); let error='';
 try {
  await page.goto('http://localhost:8081'); await page.waitForTimeout(1200); await page.screenshot({path:path.join(out,'mobile-guest-login.png'),fullPage:true});
  const email = page.getByPlaceholder('you@company.com'); const password=page.getByPlaceholder('Enter your password'); if(await email.count()){await email.fill('owner@demo.remit.ng'); await password.fill('RemitDemo2026'); await page.getByRole('button',{name:'Sign in',exact:true}).click(); await page.waitForTimeout(1800);}
  await page.screenshot({path:path.join(out,'mobile-owner-overview.png'),fullPage:true});
  for (const label of ['Employees','Payroll','Wallet','More']) { const nav=page.getByText(label,{exact:true}); if(await nav.count() && await nav.first().isVisible()){await nav.first().click(); await page.waitForTimeout(700); await page.screenshot({path:path.join(out,`mobile-owner-${label.toLowerCase()}.png`),fullPage:true});} }
 } catch(e){error=String(e)}
 outLines.push(JSON.stringify({phase:process.env.PHASE||'before',app:'mobile',role:'owner',consoleErrors,failed,error})); await context.close();
}
await fs.writeFile(path.join(root,'findings.jsonl'), outLines.join('\n')+'\n'); await browser.close();
