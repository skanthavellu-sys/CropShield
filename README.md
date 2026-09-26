# CropShield — Location-Aware Farmer Insurance Prototype

CropShield is a hackathon prototype for weather-aware crop insurance in Malaysia.

## Current flow

1. Farmer logs in / creates an account.
2. Farmer selects state and district.
3. CropShield retrieves rainfall data for the selected coordinates.
4. Farmer selects a crop and sum insured.
5. CropShield calculates the premium using the final rainfall-trigger formula.
6. Farmer clicks **Purchase Insurance**.
7. CropShield creates an active policy and shows a purchase confirmation screen.
8. The policy screen displays a 9-month expected-rainfall schedule.
9. The Claims page shows a demo rain-detection sensor reading of **0 mm**.
10. Farmer submits the claim with bank details for review.

## Final premium formula

**Premium = Sum Insured × [P(R < 0.7E) + P(R > 1.3E)] × 1.20**

Where:

- **R** = rainfall observation
- **E** = expected rainfall
- **P(R < 0.7E)** = probability of rainfall below 70% of expected rainfall (drought trigger)
- **P(R > 1.3E)** = probability of rainfall above 130% of expected rainfall (excess-rainfall trigger)
- **1.20** = 20% loading

The 20% loading is represented as:

- 6% additional expenses
- 4% sensor and monitoring expenses
- 7% risk / uncertainty margin
- 3% profit margin

For the hackathon prototype, the two probabilities are estimated from the returned historical daily rainfall observations using the selected crop's 30-day rainfall reference. This is a demonstration method and is **not an actuarially validated insurance model**.

## Example from the final formula

For a sum insured of RM10,000:

- Drought probability = 10% (0.10)
- Excess-rainfall probability = 5% (0.05)
- Trigger probability sum = 0.15
- Base premium = RM10,000 × 0.15 = RM1,500
- Final premium = RM1,500 × 1.20 = **RM1,800**

## Rainfall data

Historical rainfall comes from the Open-Meteo Archive API and the 7-day forecast comes from the Open-Meteo Forecast API.

The server sums daily historical precipitation values to produce the 30-day actual rainfall.

Important: this is API weather data for the selected coordinates. It is not a direct physical rain-gauge reading at every field.

For a production Malaysian insurance platform, the weather adapter should be replaced or supplemented with official MET Malaysia station observations / licensed climate data.

## Purchase and claim prototype

Purchased policies are stored in Firestore under the authenticated farmer account.

The policy screen shows:

- Policy ID
- Active status
- Crop
- Sum insured
- Premium
- Purchase date
- Coverage period
- 30-day rainfall
- Both rainfall-trigger probabilities
- 9 expected monthly rainfall values

The Claims page shows a **simulated** rain-detection sensor reading of 0 mm. A physical IoT sensor is not connected in this prototype.

Claims require an active policy and include:

- Crop
- Claim amount
- Reason
- Bank name
- Account holder name
- Bank account number

The claim route also checks that the claim amount does not exceed the policy's sum insured.

## Run locally

Install Node.js LTS, open this folder in VS Code, then:

```bash
npm install
npm start
```

Open:

`http://localhost:3000`

Do **not** use Live Server. CropShield runs through Express.

## Important security note

Never commit `firebase-service-account.json` to GitHub. It is listed in `.gitignore` and should be provided locally or through the deployment platform's secret-file / environment-variable mechanism.

## Main files

- `server.js` — Express backend, authentication, Firestore, location data, rainfall API, policies and claims
- `public/index.html` — UI
- `public/style.css` — UI styling
- `public/script.js` — frontend calculations, purchase flow, policy display and claim flow
- `data/sessions.json` — local session storage for the prototype
