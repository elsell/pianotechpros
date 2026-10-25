// Playwright navigation errors can include the entire fragment-bearing URL.
export async function navigatePrivateScan(page,link){
 try{return await page.goto(link);}catch{throw new Error('scan_navigation_failed');}
}
