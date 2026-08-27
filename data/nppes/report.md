# NPPES import — dry run

Harvested providers: **6705**
Distinct practice addresses: **2581**
Passed the quality gates: **1708**
Already in the directory (merge tags instead): **2**
New rows after the per-bucket caps: **84**

## Dropped, and why

| Reason | Records |
|---|---|
| nobody to name it | 759 |
| practice is outside FL/MN | 406 |
| one provider at a residential address | 52 |
| address has no street number | 24 |
| PO Box, not a consulting room | 3 |

## Could not be confirmed

Passed the quality gates but not the confirmation bar: fewer than
two providers at the address, no usable phone number, or a name
inferred for the address rather than registered at it.

| Bucket | Held back |
|---|---|
| FL Orthopedics | 1029 |
| FL Neurosurgery | 303 |
| MN Orthopedics | 37 |

Which requirement each one missed. A row can miss more than one.

| Requirement missed | Rows |
|---|---|
| fewer than two providers at the address | 1205 |
| name inferred, not registered at the address | 164 |
| no usable phone number | 2 |

## New rows by state

| State | Rows |
|---|---|
| FL | 84 |
| MN | 0 |

## Tags applied

| Tag | Rows |
|---|---|
| Orthopedics | 84 |
| Sports Medicine | 35 |
| Spine | 18 |
| General Medicine | 3 |
| Neurosurgery | 2 |
| Chiropractic | 1 |
| Physical Therapy | 1 |

## The twenty largest, for eyeballing

| Practice | Address | Providers | Tags |
|---|---|---|---|
| Orlando Health INC | 89 W Copeland Dr 1st Floor, Orlando, FL 32806 | 13 | Orthopedics, Neurosurgery |
| Orthopedic Center of Palm Beach County, LLC | 180 Jfk Dr Ste 100, Atlantis, FL 33462 | 4 | Orthopedics, Spine |
| Peter G Wernicki M D P A | 787 37th St Ste E200, Vero Beach, FL 32960 | 3 | Orthopedics |
| Nchmd INC | 1285 Creekside Blvd E Unit 102, Naples, FL 34109 | 3 | Orthopedics, Spine |
| Comprehensive Spine Institute, LLC | 1988 Gulf To Bay Blvd, Clearwater, FL 33765 | 3 | Orthopedics, Spine |
| Sacred Heart Medical Group | 4121 W Highway 98, Panama City, FL 32401 | 3 | Orthopedics, Sports Medicine |
| Farhan Siddiqi, MD PA | 2040 Short Ave, Odessa, FL 33556 | 3 | Orthopedics, Spine |
| Coastal Orthopaedics and Sports Medicine | 5145 Deer Park Dr, New Port Richey, FL 34653 | 3 | Orthopedics |
| Central Florida Bone and Joint Institute, PLLC | 2745 Rebecca Ln, Orange City, FL 32763 | 3 | Orthopedics, Sports Medicine |
| West Orange Orthopaedics & Sports Medicine PA | 596 Ocoee Commerce Pkwy, Ocoee, FL 34761 | 3 | Orthopedics, Sports Medicine |
| Lakeland Regional Health Systems, INC. | 3030 Harden Blvd, Lakeland, FL 33803 | 3 | Orthopedics, General Medicine, Sports Medicine, Chiropractic |
| Broward Institute of Orthopaedic Specialties LLC | 4400 Sheridan St, Hollywood, FL 33021 | 3 | Orthopedics |
| Lakeland Regional Health Systems, INC. | 1324 Lakeland Hills Blvd, Lakeland, FL 33805 | 3 | Orthopedics, General Medicine |
| Health First Physicians, INC | 8725 N Wickham Rd Ste 301, Melbourne, FL 32940 | 2 | Orthopedics, Sports Medicine |
| Elite Spine and Wellness, LLC | 499 NW 70th Ave Ste 200, Plantation, FL 33317 | 2 | Orthopedics, Spine |
| Johnny C. Benjamin Jr. MD., PA | 1355 37th St Ste 302, Vero Beach, FL 32960 | 2 | Orthopedics, Spine |
| Atlantic Orthopedic Assoc PA | 3066 SW Martin Downs Blvd Ste E, Palm City, FL 34990 | 2 | Orthopedics |
| Southeast Orthopedic Specialists, LLC | 4565 US Highway 17 Ste 200, Fleming Island, FL 32003 | 2 | Orthopedics, Sports Medicine |
| Ortho Florida, LLC | 350 N Pine Island Rd Suite 200, Plantation, FL 33324 | 2 | Orthopedics, Sports Medicine, Spine |
| Ortho Florida, LLC | 10794 Pines Blvd Ste 102-104, Pembroke Pines, FL 33026 | 2 | Orthopedics, Sports Medicine |

## Tags merged into rows already here

| Clinic | Matched by | Tags gained |
|---|---|---|
| Grand Itasca Clinic & Hospital – Rehab | address | Orthopedics |
| North Broward Hospital District | name+zip | Sports Medicine |
