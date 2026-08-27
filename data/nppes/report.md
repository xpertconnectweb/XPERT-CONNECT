# NPPES import — dry run

Harvested providers: **6705**
Distinct practice addresses: **2581**
Passed the quality gates: **1708**
Already in the directory (merge tags instead): **25**
New rows after the per-bucket caps: **335**

## Dropped, and why

| Reason | Records |
|---|---|
| nobody to name it | 759 |
| practice is outside FL/MN | 406 |
| one provider at a residential address | 52 |
| address has no street number | 24 |
| PO Box, not a consulting room | 3 |

## Held back by the cap

These passed every quality gate and were still left out, because the
cap is a product decision rather than a data one. Raise `CAPS` to take them.

| Bucket | Left out |
|---|---|
| FL Orthopedics | 1172 |
| FL Neurosurgery | 308 |
| MN Orthopedics | 41 |

## New rows by state

| State | Rows |
|---|---|
| FL | 230 |
| MN | 105 |

## Tags applied

| Tag | Rows |
|---|---|
| Orthopedics | 303 |
| Neurosurgery | 163 |
| Sports Medicine | 129 |
| Spine | 108 |
| General Medicine | 37 |
| Physical Therapy | 14 |
| Chiropractic | 5 |

## The twenty largest, for eyeballing

| Practice | Address | Providers | Tags |
|---|---|---|---|
| Mayo Clinic-Rochester | 200 1st St SW, Rochester, MN 55905 | 274 | Orthopedics, General Medicine, Sports Medicine, Spine, Neurosurgery |
| Florida Clinical Practice Association INC | 1600 SW Archer Rd, Gainesville, FL 32610 | 64 | Orthopedics, General Medicine, Sports Medicine, Neurosurgery, Spine |
| Mayo Clinic Florida | 4500 San Pablo Rd S, Jacksonville, FL 32224 | 56 | Orthopedics, Sports Medicine, Neurosurgery, General Medicine |
| Crosstown Surgery Center LLC | 4010 W 65th St, Edina, MN 55435 | 39 | Orthopedics, Sports Medicine, Spine |
| Fiss INC | 13020 N Telecom Pkwy, Temple Terrace, FL 33637 | 36 | Orthopedics, Sports Medicine, Chiropractic, Spine |
| Musculoskeletal Institute Chartered | 5901 E Fowler Ave Ste 100, Temple Terrace, FL 33617 | 35 | Orthopedics, Sports Medicine, Neurosurgery, Spine |
| Regions Hospital | 640 Jackson St, Saint Paul, MN 55101 | 24 | Orthopedics, Neurosurgery |
| Nicklaus Children's Pediatric Specialists, LLC | 3100 SW 62nd Ave, Miami, FL 33155 | 22 | Orthopedics, Spine, Neurosurgery |
| Allina Health System | 8100 W 78th St Suite 230, Edina, MN 55439 | 22 | Orthopedics, Sports Medicine |
| Tria Orthopaedic Center LLC | 8100 Northland Dr, Bloomington, MN 55431 | 22 | Orthopedics, Sports Medicine, Spine, Physical Therapy |
| Summit Orthopedics, LTD | 2090 Woodwinds Dr Ste 200, Woodbury, MN 55125 | 21 | Orthopedics, Spine, Sports Medicine |
| Pediatric Orthopaedic Associates | 200 University Ave E, Saint Paul, MN 55101 | 21 | Orthopedics, Neurosurgery |
| The Duluth Clinic, LTD | 400 E 3rd St, Duluth, MN 55805 | 21 | Orthopedics, Neurosurgery |
| Orlando Orthopaedic Center MD PA | 25 W Crystal Lake St Ste 200, Orlando, FL 32806 | 20 | Orthopedics, Sports Medicine, Spine |
| Cleveland Clinic Florida | 2950 Cleveland Clinic Blvd, Weston, FL 33331 | 20 | Orthopedics, Neurosurgery, Spine |
| Coastal Orthopedics & Sports Medicine of Southwest Florida PA | 8000 SR 64 E, Bradenton, FL 34212 | 19 | Orthopedics, Sports Medicine, Spine |
| Baptist Health Medical Group Orthopedics, LLC | 1150 Campo Sano Ave, Coral Gables, FL 33146 | 19 | Orthopedics, Spine, Sports Medicine, General Medicine |
| Tallahassee Orthopaedic Surgery Partners LTD | 3334 Capital Medical Blvd Ste 400, Tallahassee, FL 32308 | 19 | Orthopedics, Sports Medicine |
| South Broward Hospital District | 1150 N 35th Ave Ste 130, Hollywood, FL 33021 | 18 | Orthopedics, Sports Medicine, Neurosurgery |
| Central Florida Pediatric | 1222 S Orange Ave, Orlando, FL 32806 | 18 | Orthopedics, Neurosurgery |

## Tags merged into rows already here

| Clinic | Matched by | Tags gained |
|---|---|---|
| Ocala Regional Medical Center – PT | address | Orthopedics, General Medicine |
| Select Physical Therapy – Sarasota | address | Orthopedics, Sports Medicine |
| Select Physical Therapy – Boca Raton | address | Orthopedics, Spine |
| Select Physical Therapy – Key West | address | Orthopedics |
| RiverView Health Rehabilitation Services | address | Orthopedics, Sports Medicine |
| Orthopaedic & Fracture Clinic – Physical Therapy | address | Orthopedics |
| Allina Health Physical Therapy – Buffalo | address | Orthopedics |
| Summit Orthopedics Physical Therapy | address | Orthopedics, Sports Medicine |
| Heartland Orthopedics Physical Therapy | address | Orthopedics, Sports Medicine, Neurosurgery |
| Mayo Clinic Health System – Rehabilitation | address | Orthopedics, Neurosurgery |
| Mayo Clinic Health System – Fairmont Rehabilitation | address | Orthopedics |
| Mayo Clinic Health System – Austin Rehabilitation | address | General Medicine, Orthopedics, Sports Medicine |
| CCM Health Rehabilitation Services | address | Orthopedics |
| Mayo Clinic Health System – Albert Lea Rehabilitation | address | Orthopedics |
| Essentia Health – St. Mary’s Clinic | address | Orthopedics |
| Mayo Clinic Health System – Red Wing Rehabilitation | address | Orthopedics |
| Grand Itasca Clinic & Hospital Rehabilitation | address | Orthopedics |
| Welia Health Rehabilitation | address | Orthopedics |
| St. Cloud Orthopedics Physical Therapy | address | Orthopedics, Sports Medicine, Spine |
| New Ulm Medical Center Rehabilitation | address | Orthopedics |
| NovaCare Rehabilitation – Minneapolis | address | Orthopedics, Spine |
| Sanford Worthington Medical Center Rehabilitation | address | General Medicine, Orthopedics |
| Pipestone County Medical Center – Rehabilitation Services | address | Orthopedics |
| iChiropractic and Wellness | address | Neurosurgery |
| Lake Area Physical Therapy – Palatka | address | Orthopedics |
