# Manifest GitHub Pages Site

A simple HTML/CSS/JS website for the Manifest men's team that can be hosted on GitHub Pages.

## Features

- Responsive design that works on mobile, tablet, and desktop
- Modern, clean interface with smooth animations
- Interactive contact form
- Mobile-friendly navigation with hamburger menu
- Sections for about, values, and contact information
- Back-to-top button for better user experience

## How to Use

### Local Development

To work on this site locally:

1. Clone the repository to your local machine
2. Open the files in your preferred code editor
3. Preview the site in your browser by opening `index.html`

### Tests

Browser tests (Playwright) live in `tests/` and run in your installed Google Chrome.

1. Once: `npm install`
2. Run all tests: `npm test` (or `npm run test:ui` to watch them run)
3. In VS Code, install the recommended **Playwright Test for VS Code** extension; the tests then
   appear in the Testing panel (beaker icon) with a ▶ button for each.

The member page is tested against a simulated sign-in with made-up members
(`tests/helpers/mock-supabase.js`), and the glossary against a small made-up sheet
(`tests/fixtures/glossary.csv`). The tests never touch the real member database, and real
member data must never be added to this repository: it is public.

GitHub runs the same tests on every pull request (`.github/workflows/tests.yml`).

## Customization

### Images

- Replace the images in the `assets/img` folder with your own
- Be sure to maintain the same filenames or update the references in the HTML and CSS

### Content

- Edit the text content in `index.html` to match organization's needs
- Update links in the navigation and footer to point to resources

### Styles

- Modify colors and styles in `assets/css/styles.css`
- The main color scheme is defined using CSS variables at the top of the stylesheet

## Credits

- [Google Fonts](https://fonts.google.com/) - Lato font family
- [Font Awesome](https://fontawesome.com/) - Icons
- Inspired by the original Momentum Jekyll site