# Stock Dashboard

## Running the HTML dashboard locally
1. Ensure you have a modern web browser (Chrome, Firefox, Edge, Safari).
2. From this project directory, start a simple local web server. Two common options:
   - Python 3: `python3 -m http.server 8080`
   - Node.js: `npx serve`
3. Open your browser and navigate to `http://localhost:8080/index.html` (or the port you chose).
4. The dashboard will load the live data and Merkle verification logic defined in `script.js` and `merkle.js`.

> Tip: Opening the HTML file directly from the filesystem (`file://`) can block live API requests because of browser security policies, so prefer running through a local server.
