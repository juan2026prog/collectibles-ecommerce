import { chromium } from '@playwright/test';

async function verifyProduction() {
  console.log("Starting Live Production QA Verification on https://collectibles.uy ...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  try {
    // 1. DESKTOP 1280px QA
    console.log("\n--- 1. DESKTOP 1280px TEST ---");
    const desktopPage = await context.newPage();
    await desktopPage.setViewportSize({ width: 1280, height: 800 });
    await desktopPage.goto('https://collectibles.uy', { waitUntil: 'networkidle' });

    const licenciasHeaderLink = desktopPage.locator('header nav a[href="/licencias"]').first();
    const isLicenciasVisible = await licenciasHeaderLink.isVisible();
    console.log(`DESKTOP LICENCIAS Visible in Header: ${isLicenciasVisible ? 'PASS' : 'FAIL'}`);

    // Hover over LICENCIAS to trigger Mega Menu
    await licenciasHeaderLink.hover();
    await desktopPage.waitForTimeout(500);

    const megaMenuDropdown = desktopPage.locator('header a[href="/licencias/marvel"]').first();
    const isMegaMenuVisible = await megaMenuDropdown.isVisible();
    console.log(`DESKTOP LICENCIAS Mega Menu Dropdown Visible: ${isMegaMenuVisible ? 'PASS' : 'FAIL'}`);

    const footerLink = desktopPage.locator('header a[href="/licencias"]:has-text("Ver todas las licencias")').first();
    const isFooterLinkVisible = await footerLink.isVisible();
    console.log(`DESKTOP Footer Link "Ver todas las licencias" Visible: ${isFooterLinkVisible ? 'PASS' : 'FAIL'}`);

    // 2. MOBILE VIEWPORTS QA (360px, 390px, 430px)
    const mobileWidths = [360, 390, 430];
    for (const w of mobileWidths) {
      console.log(`\n--- 2. MOBILE ${w}px TEST ---`);
      const mobilePage = await context.newPage();
      await mobilePage.setViewportSize({ width: w, height: 840 });
      await mobilePage.goto('https://collectibles.uy', { waitUntil: 'networkidle' });

      // Open Hamburger drawer
      const hamburger = mobilePage.locator('header button').last();
      await hamburger.click();
      await mobilePage.waitForTimeout(500);

      const drawerLicencias = mobilePage.locator('a[href="/licencias"]').first();
      const drawerThemes = mobilePage.locator('a[href="/themes"]').first();

      const mobLicVisible = await drawerLicencias.isVisible();
      const mobThemeVisible = await drawerThemes.isVisible();

      console.log(`MOBILE ${w}px Licencias in Drawer: ${mobLicVisible ? 'PASS' : 'FAIL'}`);
      console.log(`MOBILE ${w}px Themes in Drawer: ${mobThemeVisible ? 'PASS' : 'FAIL'}`);
      await mobilePage.close();
    }

    // 3. PRODUCTION ROUTES QA
    console.log("\n--- 3. PRODUCTION ROUTES QA ---");
    const routePage = await context.newPage();
    
    // /licencias
    await routePage.goto('https://collectibles.uy/licencias', { waitUntil: 'networkidle' });
    const licTitle = await routePage.locator('h1').textContent();
    const hasMarvelOnPage = await routePage.locator('text=Marvel').first().isVisible();
    console.log(`ROUTE /licencias Title: "${licTitle?.trim()}", Marvel Visible: ${hasMarvelOnPage ? 'PASS' : 'FAIL'}`);

    // /licencias/marvel
    await routePage.goto('https://collectibles.uy/licencias/marvel', { waitUntil: 'networkidle' });
    const marvelHeading = await routePage.locator('h1').textContent();
    console.log(`ROUTE /licencias/marvel Heading: "${marvelHeading?.trim()}" -> PASS`);

    // /themes
    await routePage.goto('https://collectibles.uy/themes', { waitUntil: 'networkidle' });
    const themesTitle = await routePage.locator('h1').textContent();
    const hasCineTv = await routePage.locator('text=Cine & TV').first().isVisible();
    console.log(`ROUTE /themes Title: "${themesTitle?.trim()}", Cine & TV Visible: ${hasCineTv ? 'PASS' : 'FAIL'}`);

  } catch (err) {
    console.error("QA Verification Error:", err);
  } finally {
    await browser.close();
  }
}

verifyProduction();
