const fetch = require('node-fetch');

const obtenerCotizacionDolar = async () => {
    try {
        // Consultamos a una API que centraliza los valores de Argentina (DolarApi)
        const response = await fetch('https://dolarapi.com/v1/dolares/blue');
        const data = await response.json();
        
        // Retornamos el valor de venta, que es el que suelen usar las agencias
        return data.venta; 
    } catch (error) {
        console.error("Error al obtener la cotización:", error);
        return null; // En caso de error, devolvemos null para manejarlo en la ruta
    }
};

module.exports = { obtenerCotizacionDolar };