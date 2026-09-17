import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import ProductViewer from './components/ProductViewer.jsx';

export default function App({ initialFold }) {
  return (
    <>
      <Header />
      <main>
        <ProductViewer initialFold={initialFold} />
      </main>
      <Footer />
    </>
  );
}
