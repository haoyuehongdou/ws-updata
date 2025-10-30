import React from 'react';
import { useWhatsApp } from '../contexts/WhatsAppContext';
import Dashboard from './Dashboard';
import WhatsAppConnect from './WhatsAppConnect';

const MainPage = () => {
    const { isLoggedIn } = useWhatsApp();

    return isLoggedIn ? <Dashboard /> : <WhatsAppConnect />;
};

export default MainPage;
