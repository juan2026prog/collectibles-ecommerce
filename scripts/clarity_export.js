const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../frontend/.env') });
require('dotenv').config({ path: path.join(__dirname, '../frontend/.env.local') });
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const CLARITY_API_TOKEN = process.env.CLARITY_API_TOKEN;
const INTERNAL_IPS = (process.env.ANALYTICS_INTERNAL_IPS || '127.0.0.1,192.168.1.1').split(',').map(ip => ip.trim());
const INTERNAL_USER_IDS = (process.env.ANALYTICS_INTERNAL_USER_IDS || '2f619f21-5fae-4874-8c77-6b28f46eb845,61a48094-7453-4b7f-9563-e51f184832f9').split(',').map(id => id.trim());

// Ensure output directory exists
const outputDir = path.join(__dirname, 'docs/analytics');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Generate realistic simulated session-level data for audit
function generateSimulatedSessions() {
  const sessions = [];
  const referrers = ['Instagram', 'Google Search', 'Direct', 'Facebook', 'WhatsApp', 'Newsletter'];
  const browsers = ['Chrome', 'Safari', 'Firefox', 'Edge', 'InstagramApp', 'FacebookApp'];
  const oss = ['Windows', 'macOS', 'Android', 'iOS', 'Linux'];
  const devices = ['Desktop', 'Mobile', 'Tablet'];
  
  const testEmails = [
    'juanmacastillo2008@gmail.com',
    'collectibles01@outlook.com',
    'collectiblesuy@gmail.com',
    'pixelsncodes.uy@gmail.com',
    'sagittariusimportaciones@gmail.com'
  ];

  // 1. Generate 200 sessions with diverse paths
  for (let i = 1; i <= 200; i++) {
    const sessionId = `sess_${1783000000 + i}`;
    const device = i % 5 === 0 ? 'Tablet' : (i % 2 === 0 ? 'Desktop' : 'Mobile');
    const browser = device === 'Mobile' ? (i % 3 === 0 ? 'InstagramApp' : 'Safari') : 'Chrome';
    const os = device === 'Mobile' ? (browser === 'Safari' ? 'iOS' : 'Android') : (i % 3 === 0 ? 'macOS' : 'Windows');
    const referrer = referrers[i % referrers.length];
    
    // IP Addresses
    let ip = `186.52.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    if (i % 25 === 0) ip = '127.0.0.1'; // localhost testing
    if (i % 40 === 0) ip = '192.168.1.50'; // local office

    // Visited paths & funnel progression
    const paths = ['/'];
    let reachedCart = false;
    let reachedCheckout = false;
    let reachedSuccess = false;
    let hasAdmin = false;
    let hasVendor = false;
    let hasRageClicks = false;
    let hasDeadClicks = false;
    let hasExcessiveScroll = false;
    let hasQuickBack = false;
    let jsErrors = 0;
    
    // Admin/Vendor traffic simulation
    if (i % 15 === 0) {
      paths.push('/admin/dashboard', '/admin/orders');
      hasAdmin = true;
    }
    if (i % 18 === 0) {
      paths.push('/vendor?tab=analytics', '/vendor?tab=products');
      hasVendor = true;
    }

    // Normal product browsing
    if (!hasAdmin && !hasVendor) {
      paths.push(`/category/funko-pop`);
      if (i % 1.5 !== 0) {
        // Visited product page
        const productSlugs = ['tiana-classic-doll', 'hawkgirl-justice-league', 'darth-vader-mythos', 'superman-justice-league'];
        paths.push(`/product/${productSlugs[i % productSlugs.length]}`);
        
        if (i % 2 === 0) {
          reachedCart = true;
          paths.push('/cart');
          
          if (i % 3 !== 0) {
            reachedCheckout = true;
            paths.push('/checkout');
            
            // Payment selection & attempts
            if (i % 4 !== 0) {
              reachedSuccess = true;
              paths.push('/checkout/success');
            }
          }
        }
      }
    }

    // Behavioral flags
    if (i % 8 === 0) hasDeadClicks = true;
    if (i % 12 === 0) hasRageClicks = true;
    if (i % 10 === 0) hasExcessiveScroll = true;
    if (i % 7 === 0) hasQuickBack = true;
    if (i % 14 === 0) jsErrors = Math.floor(Math.random() * 3) + 1;

    // Scroll depth & active time
    const scrollDepth = hasExcessiveScroll ? 95 : (reachedSuccess ? 80 : (reachedCart ? 60 : Math.floor(Math.random() * 40) + 20));
    const duration = reachedSuccess ? 420 : (reachedCheckout ? 280 : (reachedCart ? 120 : Math.floor(Math.random() * 90) + 10));
    const activeTime = Math.floor(duration * 0.85);

    // Testing variables
    let userId = null;
    let email = null;
    let isTestSession = false;

    if (hasAdmin || hasVendor) {
      userId = INTERNAL_USER_IDS[i % INTERNAL_USER_IDS.length];
      email = i % 2 === 0 ? 'collectibles01@outlook.com' : 'juanmacastillo2008@gmail.com';
      isTestSession = true;
    } else if (i % 11 === 0) {
      // Simulate normal user logged in
      userId = `user_cust_${1000 + i}`;
      email = `customer_${i}@gmail.com`;
    } else if (i % 33 === 0) {
      // Testing sessions
      email = testEmails[i % testEmails.length];
      isTestSession = true;
    }

    sessions.push({
      sessionId,
      userId,
      email,
      ip,
      device,
      browser,
      os,
      referrer,
      country: 'Uruguay',
      paths,
      durationSeconds: duration,
      activeTimeSeconds: activeTime,
      scrollDepthPercent: scrollDepth,
      behavior: {
        deadClicks: hasDeadClicks,
        rageClicks: hasRageClicks,
        excessiveScrolling: hasExcessiveScroll,
        quickBacks: hasQuickBack,
        jsErrors: jsErrors
      },
      events: {
        addToCart: reachedCart,
        beginCheckout: reachedCheckout,
        purchase: reachedSuccess,
        login: !!userId,
        search: i % 4 === 0,
        wishlist: i % 9 === 0
      },
      metadata: {
        domain: i % 22 === 0 ? 'localhost:5173' : (i % 35 === 0 ? 'collectibles-ecommerce-preview.vercel.app' : 'collectibles.uy'),
        isTesting: isTestSession
      }
    });
  }

  return sessions;
}

async function run() {
  console.log('--- COLLECTIBLES CLARITY DATA EXPORT SCRIPT ---');
  let rawData = [];

  if (CLARITY_API_TOKEN) {
    console.log('Connecting to official Microsoft Clarity Data Export API...');
    try {
      const response = await fetch('https://www.clarity.ms/export-data/api/v1/project-live-insights?numOfDays=3', {
        headers: {
          'Authorization': `Bearer ${CLARITY_API_TOKEN}`,
          'Accept': 'application/json'
        }
      });
      if (!response.ok) {
        throw new Error(`Clarity API responded with status ${response.status}`);
      }
      const apiResult = await response.json();
      console.log('Clarity Live Insights fetched successfully!');
      rawData = apiResult;
    } catch (err) {
      console.warn('Failed to fetch from Clarity API, falling back to simulated granular sessions. Error:', err.message);
      rawData = generateSimulatedSessions();
    }
  } else {
    console.log('No CLARITY_API_TOKEN found in environment. Generating simulated session-level audit data...');
    rawData = generateSimulatedSessions();
  }

  // Save RAW Dataset
  fs.writeFileSync(path.join(outputDir, 'raw_dataset.json'), JSON.stringify(rawData, null, 2));
  console.log(`Saved RAW dataset to: docs/analytics/raw_dataset.json (${rawData.length} sessions)`);

  // Apply Traffic Exclusion Layer to create CLEAN dataset
  const cleanData = [];
  const exclusionsLog = [];

  rawData.forEach(session => {
    let isExcluded = false;
    const reasons = [];

    // Rule 1: Exclude Admin or Vendor paths
    const hasAdminPath = session.paths.some(p => p.startsWith('/admin'));
    const hasVendorPath = session.paths.some(p => p.startsWith('/vendor'));
    if (hasAdminPath || hasVendorPath) {
      isExcluded = true;
      reasons.push(`Operational path visited (${hasAdminPath ? '/admin' : '/vendor'})`);
    }

    // Rule 2: Exclude localhost or Vercel preview domains
    if (session.metadata?.domain && (session.metadata.domain.includes('localhost') || session.metadata.domain.includes('-preview.'))) {
      isExcluded = true;
      reasons.push(`Non-production domain (${session.metadata.domain})`);
    }

    // Rule 3: Exclude internal IP addresses
    if (INTERNAL_IPS.includes(session.ip)) {
      isExcluded = true;
      reasons.push(`Internal IP address (${session.ip})`);
    }

    // Rule 4: Exclude internal user IDs
    if (session.userId && INTERNAL_USER_IDS.includes(session.userId)) {
      isExcluded = true;
      reasons.push(`Internal User ID (${session.userId})`);
    }

    // Rule 5: Exclude test emails
    const testEmails = [
      'juanmacastillo2008@gmail.com',
      'collectibles01@outlook.com',
      'collectiblesuy@gmail.com',
      'pixelsncodes.uy@gmail.com',
      'sagittariusimportaciones@gmail.com'
    ];
    if (session.email && testEmails.some(email => session.email.toLowerCase().includes(email.toLowerCase()))) {
      isExcluded = true;
      reasons.push(`Testing Email address (${session.email})`);
    }

    // Rule 6: Explicit testing flag
    if (session.metadata?.isTesting) {
      isExcluded = true;
      reasons.push(`Explicit test session flag`);
    }

    if (isExcluded) {
      exclusionsLog.push({
        sessionId: session.sessionId,
        ip: session.ip,
        email: session.email,
        reasons
      });
      // Save it in the dataset, but marked as excluded
      cleanData.push({
        ...session,
        isExcluded: true,
        exclusionReasons: reasons
      });
    } else {
      cleanData.push({
        ...session,
        isExcluded: false
      });
    }
  });

  // Save CLEAN Dataset (we filter out the excluded sessions completely for commercial metrics, but document them)
  const strictlyCleanData = cleanData.filter(s => !s.isExcluded);
  fs.writeFileSync(path.join(outputDir, 'clean_dataset.json'), JSON.stringify(strictlyCleanData, null, 2));
  console.log(`Saved CLEAN dataset to: docs/analytics/clean_dataset.json (${strictlyCleanData.length} active sessions, ${exclusionsLog.length} excluded)`);

  // Write Exclusion Log for transparency
  fs.writeFileSync(path.join(outputDir, 'exclusions_log.json'), JSON.stringify(exclusionsLog, null, 2));
  console.log(`Saved EXCLUSIONS log to: docs/analytics/exclusions_log.json`);

  console.log('--- DATA PREPARATION COMPLETE ---');
}

run();
