# CropShield — Location-Aware Full App

This version lets different farmers use different Malaysian states and districts.

## How location works

Each farmer selects:

1. State
2. District
3. Crop
4. Sum insured
5. Coverage

CropShield automatically fills representative coordinates for the selected district and sends those coordinates to the rainfall API.

The farmer can also fine-tune latitude/longitude when they know the exact farm location.

So:

Farmer A → Kedah → Kulim → rainfall for Kulim coordinates

Farmer B → Selangor → Sepang → rainfall for Sepang coordinates

Farmer C → Sarawak → Kuching → rainfall for Kuching coordinates

There is no single rainfall value shared by all farmers.

## Run

Install Node.js LTS, open this folder in VS Code, then:

npm install

npm start

Open:

http://localhost:3000

Do NOT use Live Server.

## Rainfall

Historical rainfall comes from the Open-Meteo Archive API and the 7-day forecast comes from the Open-Meteo Forecast API.

The server sums the daily historical precipitation values to produce the 30-day actual rainfall.

Important: this is API weather data for the selected coordinates. It is not a direct rain-gauge measurement at every field.

For a production Malaysian insurance platform, the weather adapter should be replaced or supplemented with official MET Malaysia station observations / licensed climate data.

## Location accuracy

The state/district coordinates in this prototype represent the district area, not the exact farm.

For the hackathon, this demonstrates the correct architecture:

farmer → farm location → weather data → risk engine → premium

For production:

farmer → exact farm GPS → nearest approved weather station / gridded observation → validated rainfall trigger → insurance decision

## Premium

Prototype only:

premium = sum insured × coverage × crop rate

Crop rates are demonstration values and are NOT official Malaysian insurance tariffs.

## Risk

The rainfall risk thresholds are demonstration logic only. They are NOT actuarially validated.

A production policy should use validated crop-, season-, location- and growth-stage-specific thresholds, plus flood/drought triggers and historical loss data.

## Files

- server.js — backend, authentication, location list and weather API adapter
- public/index.html — UI
- public/style.css — UI styling
- public/script.js — frontend logic
- data/users.json — local user accounts
- data/sessions.json — local sessions


## Premium formula

Premium = Probability of Drought × (Sum Insured × Coverage %) × Probability of Loss Given Drought.

Example: RM50,000 × 80% coverage × 20% drought probability × 40% loss probability = RM3,200.

The drought and crop-loss probabilities in this hackathon prototype are assumptions for demonstration and are not actuarially validated.
