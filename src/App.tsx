import { HashRouter, Route, Routes } from 'react-router-dom';
import { BoxDetail } from './ui/BoxDetail';
import { Catalog } from './ui/Catalog';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Catalog />} />
        <Route path="/box/:id" element={<BoxDetail />} />
      </Routes>
    </HashRouter>
  );
}
