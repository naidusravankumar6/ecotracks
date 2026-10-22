
"use strict";

// ---------- HTML elements ----------
const locationInput = document.getElementById("locationInput");
const searchLocationBtn = document.getElementById("searchLocationBtn");
const currentLocationBtn = document.getElementById("currentLocationBtn");
const locationMessage = document.getElementById("locationMessage");
const locationDetails = document.getElementById("locationDetails");

const locationName = document.getElementById("locationName");
const locationCoordinates = document.getElementById("locationCoordinates");
const locationEcoTip = document.getElementById("locationEcoTip");
const locationTemperature = document.getElementById("locationTemperature");
const locationHumidity = document.getElementById("locationHumidity");
const locationAQI = document.getElementById("locationAQI");

// Additional dashboard fields
const locationPM25 = document.getElementById("locationPM25");
const locationPM10 = document.getElementById("locationPM10");
const locationWind = document.getElementById("locationWind");
const locationFeelsLike = document.getElementById("locationFeelsLike");
const aqiDescription = document.getElementById("aqiDescription");

const ecoSearchForm = document.getElementById("ecoSearchForm");

// Prevent multiple simultaneous requests from the same button
let requestNumber = 0;

// ---------- Search for a city ----------
ecoSearchForm.addEventListener("submit", function (event) {
    event.preventDefault();
    searchLocation();
});

async function searchLocation() {
    const query = locationInput.value.trim();

    if (query.length < 2) {
        showMessage("Please enter at least two characters.", "error");
        return;
    }

    const thisRequest = ++requestNumber;
    setLoading(true);
    showMessage("Searching for your location...", "");

    try {
        const url =
            "https://geocoding-api.open-meteo.com/v1/search?" +
            new URLSearchParams({
                name: query,
                count: "8",
                language: "en",
                format: "json"
            });

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error("Could not search for this location.");
        }

        const data = await response.json();

        // Ignore an older response if a newer search has started
        if (thisRequest !== requestNumber) return;

        if (!data.results || data.results.length === 0) {
            showMessage(
                "No matching location found. Try a city name, such as Srikakulam, India.",
                "error"
            );
            return;
        }

        let selectedLocation = data.results[0];

        // If several places match, allow the user to choose
        if (data.results.length > 1) {
            const choices = data.results.map((place, index) => {
                const area = [place.admin1, place.country]
                    .filter(Boolean)
                    .join(", ");

                return `${index + 1}. ${place.name} (${area})`;
            });

            const answer = window.prompt(
                "Choose a location by entering its number:\n\n" +
                choices.join("\n") +
                "\n\nEnter 1 for the first result.",
                "1"
            );

            if (answer === null) {
                showMessage("Location selection cancelled.", "");
                return;
            }

            const selectedIndex = Number(answer) - 1;

            if (
                !Number.isInteger(selectedIndex) ||
                selectedIndex < 0 ||
                selectedIndex >= data.results.length
            ) {
                showMessage("Invalid choice. Please search again.", "error");
                return;
            }

            selectedLocation = data.results[selectedIndex];
        }

        await loadEnvironmentalData(
            selectedLocation.latitude,
            selectedLocation.longitude,
            formatLocationName(selectedLocation),
            thisRequest
        );
    } catch (error) {
        if (thisRequest === requestNumber) {
            console.error("Location search error:", error);
            showMessage(
                "Unable to search right now. Check your internet connection and try again.",
                "error"
            );
        }
    } finally {
        if (thisRequest === requestNumber) {
            setLoading(false);
        }
    }
}

// ---------- Use the device's current location ----------
currentLocationBtn.addEventListener("click", function () {
    if (!navigator.geolocation) {
        showMessage(
            "Your browser does not support location services.",
            "error"
        );
        return;
    }

    const thisRequest = ++requestNumber;

    showMessage("Requesting your current location...", "");
    setLoading(true);

    navigator.geolocation.getCurrentPosition(
        async function (position) {
            if (thisRequest !== requestNumber) return;

            const latitude = position.coords.latitude;
            const longitude = position.coords.longitude;

            await loadEnvironmentalData(
                latitude,
                longitude,
                "Your Current Location",
                thisRequest
            );

            if (thisRequest === requestNumber) {
                setLoading(false);
            }
        },
        function (error) {
            if (thisRequest !== requestNumber) return;

            let message = "Could not get your location.";

            if (error.code === error.PERMISSION_DENIED) {
                message =
                    "Location permission was denied. Allow location access in your browser settings.";
            } else if (error.code === error.POSITION_UNAVAILABLE) {
                message =
                    "Your current location is unavailable. Try searching for a city instead.";
            } else if (error.code === error.TIMEOUT) {
                message =
                    "The location request timed out. Please try again.";
            }

            showMessage(message, "error");
            setLoading(false);
        },
        {
            enableHighAccuracy: false,
            timeout: 15000,
            maximumAge: 300000
        }
    );
});

// ---------- Load weather and air quality ----------
async function loadEnvironmentalData(
    latitude,
    longitude,
    name,
    thisRequest
) {
    try {
        showMessage("Loading weather and air-quality data...", "");

        const weatherUrl =
            "https://api.open-meteo.com/v1/forecast?" +
            new URLSearchParams({
                latitude: String(latitude),
                longitude: String(longitude),
                current: [
                    "temperature_2m",
                    "relative_humidity_2m",
                    "apparent_temperature",
                    "weather_code",
                    "wind_speed_10m"
                ].join(","),
                timezone: "auto"
            });

        const airQualityUrl =
            "https://air-quality-api.open-meteo.com/v1/air-quality?" +
            new URLSearchParams({
                latitude: String(latitude),
                longitude: String(longitude),
                current: [
                    "us_aqi",
                    "pm2_5",
                    "pm10"
                ].join(","),
                timezone: "auto"
            });

        // Load both services independently so one can still display if
        // the other service is temporarily unavailable.
        const results = await Promise.allSettled([
            fetch(weatherUrl).then(checkResponse),
            fetch(airQualityUrl).then(checkResponse)
        ]);

        if (thisRequest !== requestNumber) return;

        const weatherResult = results[0];
        const airResult = results[1];

        const weather = weatherResult.status === "fulfilled"
            ? weatherResult.value
            : null;

        const air = airResult.status === "fulfilled"
            ? airResult.value
            : null;

        if (!weather && !air) {
            throw new Error("Both environmental data services failed.");
        }

        renderDashboard(latitude, longitude, name, weather, air);

        if (weather && air) {
            showMessage("Environmental data loaded successfully.", "success");
        } else if (weather) {
            showMessage(
                "Weather loaded, but air-quality data is temporarily unavailable.",
                ""
            );
        } else {
            showMessage(
                "Air quality loaded, but weather data is temporarily unavailable.",
                ""
            );
        }
    } catch (error) {
        if (thisRequest === requestNumber) {
            console.error("Environmental data error:", error);
            showMessage(
                "Unable to load environmental data. Please try again later.",
                "error"
            );
        }
    }
}

// ---------- Render the dashboard ----------
function renderDashboard(latitude, longitude, name, weather, air) {
    locationName.textContent = name;

    locationCoordinates.textContent =
        `Latitude: ${latitude.toFixed(4)} · Longitude: ${longitude.toFixed(4)}`;

    if (weather && weather.current) {
        const current = weather.current;

        locationTemperature.textContent =
            formatValue(current.temperature_2m, "°C");

        locationHumidity.textContent =
            formatValue(current.relative_humidity_2m, "%");

        locationFeelsLike.textContent =
            formatValue(current.apparent_temperature, "°C");

        locationWind.textContent =
            formatValue(current.wind_speed_10m, "km/h");
    } else {
        locationTemperature.textContent = "Unavailable";
        locationHumidity.textContent = "Unavailable";
        locationFeelsLike.textContent = "Unavailable";
        locationWind.textContent = "Unavailable";
    }

    if (air && air.current) {
        const currentAir = air.current;

        locationAQI.textContent = formatValue(currentAir.us_aqi, "");

        locationPM25.textContent = formatValue(currentAir.pm2_5, "");
        locationPM10.textContent = formatValue(currentAir.pm10, "");

        aqiDescription.textContent = currentAir.us_aqi == null
            ? "US AQI · Unavailable"
            : `US AQI · ${getAQICategory(currentAir.us_aqi)}`;
    } else {
        locationAQI.textContent = "Unavailable";
        locationPM25.textContent = "Unavailable";
        locationPM10.textContent = "Unavailable";
        aqiDescription.textContent = "Air-quality data unavailable";
    }

    locationEcoTip.textContent = getEcoTip(weather, air);

    locationDetails.hidden = false;
}

// ---------- Format location names ----------
function formatLocationName(place) {
    return [
        place.name,
        place.admin1,
        place.country
    ]
        .filter(Boolean)
        .filter((value, index, values) => values.indexOf(value) === index)
        .join(", ");
}

// ---------- Handle missing values ----------
function formatValue(value, unit) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
        return "Unavailable";
    }

    const formatted = Number(value).toFixed(1);
    return unit ? `${formatted} ${unit}` : formatted;
}

// ---------- AQI category ----------
function getAQICategory(aqi) {
    if (aqi == null || !Number.isFinite(Number(aqi))) {
        return "Unavailable";
    }

    const value = Number(aqi);

    if (value <= 50) return "Good";
    if (value <= 100) return "Moderate";
    if (value <= 150) return "Unhealthy for Sensitive Groups";
    if (value <= 200) return "Unhealthy";
    if (value <= 300) return "Very Unhealthy";

    return "Hazardous";
}

// ---------- Environment-based tips ----------
function getEcoTip(weather, air) {
    const temperature = weather?.current?.temperature_2m;
    const humidity = weather?.current?.relative_humidity_2m;
    const windSpeed = weather?.current?.wind_speed_10m;
    const aqi = air?.current?.us_aqi;
    const pm25 = air?.current?.pm2_5;

    if (aqi != null && aqi > 150) {
        return "Air quality is unhealthy. Reduce strenuous outdoor activity, especially if you are sensitive to air pollution. Avoid adding smoke or unnecessary emissions.";
    }

    if (pm25 != null && pm25 > 35.4) {
        return "Fine-particle pollution is elevated. Avoid burning waste, reduce unnecessary vehicle trips, and consider limiting strenuous outdoor activity.";
    }

    if (temperature != null && temperature >= 35) {
        return "It is very hot. Stay hydrated, seek shade, and save electricity by using cooling systems efficiently.";
    }

    if (humidity != null && humidity < 30) {
        return "Air humidity is low. Use water carefully, protect plants from drying out, and avoid unnecessary water waste.";
    }

    if (windSpeed != null && windSpeed >= 25) {
        return "Wind speeds are high. Secure loose outdoor items and avoid burning leaves or waste, as smoke can spread quickly.";
    }

    if (aqi != null && aqi <= 50) {
        return "Air quality is good according to the available model. Consider walking or cycling for short journeys and keep nearby green spaces clean.";
    }

    return "Help the environment by reducing single-use plastics, saving electricity and water, planting native species, and choosing cleaner transport when possible.";
}

// ---------- User interface helpers ----------
function showMessage(message, type) {
    locationMessage.textContent = message;
    locationMessage.className = "status-message";

    if (type) {
        locationMessage.classList.add(type);
    }
}

function setLoading(isLoading) {
    searchLocationBtn.disabled = isLoading;
    currentLocationBtn.disabled = isLoading;

    searchLocationBtn.textContent = isLoading
        ? "Loading..."
        : "Search Location";

    currentLocationBtn.textContent = isLoading
        ? "Please wait..."
        : "📍 Use My Location";
}

function checkResponse(response) {
    if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
    }

    return response.json();
}
