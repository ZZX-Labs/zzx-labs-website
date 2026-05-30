#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

DIRS = [
    "shop/digital",
    "shop/software",
    "shop/hardware",
    "shop/kits",
    "shop/books",
    "shop/publications",
    "shop/papers",
    "shop/reports",
    "shop/data",
    "shop/datasets",
    "shop/research",
    "shop/documentation",
    "shop/templates",
    "shop/source-code",
    "shop/firmware",
    "shop/graphics",
    "shop/icons",
    "shop/fonts",
    "shop/music",
    "shop/audio",
    "shop/video",
    "shop/artwork",
    "shop/prints",
    "shop/stickers",
    "shop/apparel",
    "shop/accessories",
    "shop/collectibles",
    "shop/limited-editions",
    "shop/services",
    "shop/subscriptions",
    "shop/memberships",
    "shop/licenses",
    "shop/gift-cards",
    "shop/custom-work",
    "shop/featured",
    "shop/new-releases",
    "shop/best-sellers",
    "shop/free",
    "shop/open-source",
    "shop/payments",
    "shop/shipping",
    "shop/returns",
    "shop/faq",

    "payments/addresses",
    "payments/api",
    "payments/benefits",
    "payments/bonuses",
    "payments/bug-bounties",
    "payments/bounties",
    "payments/certifications",
    "payments/commissions",
    "payments/compensation",
    "payments/conference-funding",
    "payments/consulting",
    "payments/contracting",
    "payments/donate",
    "payments/education-funding",
    "payments/equipment-funding",
    "payments/escrow",
    "payments/expenses",
    "payments/faq",
    "payments/fellowships",
    "payments/grants",
    "payments/incubation-funding",
    "payments/insurance",
    "payments/invoices",
    "payments/investments",
    "payments/licensing",
    "payments/ln",
    "payments/lodging",
    "payments/meals",
    "payments/memberships",
    "payments/onchain",
    "payments/partner-funding",
    "payments/payroll",
    "payments/per-diem",
    "payments/policies",
    "payments/procurement",
    "payments/receipts",
    "payments/recurring",
    "payments/refunds",
    "payments/reimbursements",
    "payments/relocation",
    "payments/research-awards",
    "payments/research-funding",
    "payments/retainers",
    "payments/royalties",
    "payments/scholarships",
    "payments/seed-funding",
    "payments/services",
    "payments/shop",
    "payments/sponsorships",
    "payments/startup-funding",
    "payments/stipends",
    "payments/subscriptions",
    "payments/supported-networks",
    "payments/supported-wallets",
    "payments/training",
    "payments/transportation",
    "payments/travel",
    "payments/vendors",
    "payments/venture-funding",
]

TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex, nofollow">
    <meta name="description" content="{title} for ZZX-Labs R&D.">
    <title>{title} | ZZX-Labs R&D</title>

    <link rel="icon" href="{prefix}static/icons/favicon.ico" type="image/x-icon">
    <link rel="icon" href="{prefix}static/icons/favicon-32.png" sizes="32x32" type="image/png">
    <link rel="icon" href="{prefix}static/icons/favicon-16.png" sizes="16x16" type="image/png">
    <link rel="apple-touch-icon" href="{prefix}static/icons/apple-touch-icon.png">

    <link rel="stylesheet" href="{prefix}static/styles.css">
    <script src="{prefix}static/script.js" defer></script>
</head>

<body class="zzx-site-page zzx-page-placeholder">
<header>
    <div id="zzx-header"></div>

    <br>

    <div id="ticker-container"></div>

    <br>
</header>

<main class="zzx-page-shell">
    <section class="zzx-page-hero container">
        <p class="zzx-kicker">ZZX-Labs / {kicker}</p>
        <h1>{title}</h1>
        <p>
            This page is reserved for {title}. It has been created as a placeholder so the repository structure,
            navigation, future links, and site topology can exist before the full page is written.
        </p>
        <div class="zzx-action-row">
            <a href="{parent}" class="btn">Back</a>
            <a href="{prefix}notice" class="btn btn-outline">Notice Hub</a>
            <a href="{prefix}contact" class="btn btn-outline">Contact</a>
        </div>
    </section>

    <section class="container zzx-panel">
        <p class="zzx-kicker">Development Notice</p>
        <h2>This Page Is Under Active Development</h2>
        <p>
            Content, layout, data sources, payment rules, products, policies, links, and functionality may be incomplete
            or subject to change.
        </p>
    </section>
</main>

<footer>
    <div id="zzx-footer"></div>
</footer>
</body>
</html>
"""


def title_from_slug(path: str) -> str:
    return path.strip("/").split("/")[-1].replace("-", " ").replace("_", " ").title()


def prefix_for(path: str) -> str:
    depth = len(Path(path).parts)
    return "../" * depth


def main() -> int:
    created = 0
    skipped = 0

    for rel in DIRS:
        directory = ROOT / rel
        index = directory / "index.html"

        directory.mkdir(parents=True, exist_ok=True)

        if index.exists():
            skipped += 1
            continue

        title = title_from_slug(rel)
        prefix = prefix_for(rel)
        parent = "../"

        index.write_text(
            TEMPLATE.format(
                title=title,
                kicker=rel,
                prefix=prefix,
                parent=parent,
            ),
            encoding="utf-8",
        )
        created += 1

    print(f"Created {created} index.html files.")
    print(f"Skipped {skipped} existing index.html files.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
