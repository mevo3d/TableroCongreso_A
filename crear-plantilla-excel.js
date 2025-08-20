const ExcelJS = require('exceljs');
const path = require('path');

async function crearPlantillaExcel() {
    const workbook = new ExcelJS.Workbook();
    
    // Hoja 1: Datos de la Sesión
    const datosSheet = workbook.addWorksheet('DATOS_SESION');
    datosSheet.columns = [
        { header: 'CAMPO', key: 'campo', width: 30 },
        { header: 'VALOR', key: 'valor', width: 50 }
    ];
    
    datosSheet.addRows([
        { campo: 'NOMBRE_SESION', valor: 'Sesión Ordinaria - [FECHA]' },
        { campo: 'FECHA_PROPUESTA', valor: '2024-01-01' },
        { campo: 'DESCRIPCION', valor: 'Descripción de la sesión' },
        { campo: 'TIPO_SESION', valor: 'ordinaria' },
        { campo: 'LEGISLATURA', valor: 'LVI' },
        { campo: 'PERIODO', valor: 'Primer Periodo Ordinario' }
    ]);
    
    // Aplicar estilos
    datosSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
    datosSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '4472C4' }
    };
    
    // Hoja 2: Iniciativas
    const iniciativasSheet = workbook.addWorksheet('INICIATIVAS');
    iniciativasSheet.columns = [
        { header: 'NUMERO_ORDEN_DIA', key: 'numero_orden_dia', width: 18 },
        { header: 'NUMERO', key: 'numero', width: 10 },
        { header: 'TITULO', key: 'titulo', width: 60 },
        { header: 'TEXTO_COMPLETO', key: 'texto_completo', width: 80 },
        { header: 'PRESENTADOR', key: 'presentador', width: 35 },
        { header: 'PARTIDO', key: 'partido', width: 15 },
        { header: 'TIPO_MAYORIA', key: 'tipo_mayoria', width: 15 },
        { header: 'TIPO_INICIATIVA', key: 'tipo_iniciativa', width: 20 },
        { header: 'COMISION', key: 'comision', width: 35 },
        { header: 'TURNO', key: 'turno', width: 18 },
        { header: 'FECHA_PRESENTACION', key: 'fecha_presentacion', width: 20 },
        { header: 'OBSERVACIONES', key: 'observaciones', width: 45 }
    ];
    
    // Agregar ejemplos de iniciativas
    iniciativasSheet.addRows([
        {
            numero_orden_dia: '4.1',
            numero: 1,
            titulo: 'EJEMPLO: Iniciativa con proyecto de decreto por el que se reforma el artículo 15 de la Ley de Educación del Estado de Morelos',
            texto_completo: 'EJEMPLO: Con fundamento en lo dispuesto por los artículos 40 fracción II, 42 fracción II y 50 de la Constitución Política del Estado Libre y Soberano de Morelos...',
            presentador: 'Dip. Juan Pérez González',
            partido: 'MORENA',
            tipo_mayoria: 'simple',
            tipo_iniciativa: 'iniciativa_decreto',
            comision: 'Educación y Cultura',
            turno: 'Primera Lectura',
            fecha_presentacion: '2024-01-15',
            observaciones: 'Urgente y obvia resolución'
        },
        {
            numero_orden_dia: '5.1',
            numero: 2,
            titulo: 'EJEMPLO: Proposición con punto de acuerdo parlamentario por el que se exhorta respetuosamente al Titular del Poder Ejecutivo',
            texto_completo: 'EJEMPLO: Los que suscriben, diputados integrantes del Grupo Parlamentario del PAN, con fundamento en lo dispuesto por el artículo 18 fracción IV...',
            presentador: 'Dip. María López Hernández',
            partido: 'PAN',
            tipo_mayoria: 'absoluta',
            tipo_iniciativa: 'punto_acuerdo',
            comision: 'Seguridad Pública y Protección Civil',
            turno: 'Única Lectura',
            fecha_presentacion: '2024-01-16',
            observaciones: 'Para su discusión y votación'
        },
        {
            numero_orden_dia: '6.1',
            numero: 3,
            titulo: 'EJEMPLO: Dictamen emanado de la Comisión de Hacienda, Presupuesto y Cuenta Pública',
            texto_completo: 'EJEMPLO: A la Comisión de Hacienda, Presupuesto y Cuenta Pública le fue turnada para su análisis y dictamen correspondiente...',
            presentador: 'Comisión de Hacienda',
            partido: 'COMISIÓN',
            tipo_mayoria: 'calificada',
            tipo_iniciativa: 'dictamen',
            comision: 'Hacienda, Presupuesto y Cuenta Pública',
            turno: 'Segunda Lectura',
            fecha_presentacion: '2024-01-17',
            observaciones: 'Dictamen en sentido positivo'
        }
    ]);
    
    // Aplicar estilos
    iniciativasSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
    iniciativasSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '70AD47' }
    };
    
    // Agregar validación de datos
    iniciativasSheet.dataValidations.add('G2:G100', {
        type: 'list',
        allowBlank: false,
        formulae: ['"simple,absoluta,calificada,unanime"']
    });
    
    iniciativasSheet.dataValidations.add('H2:H100', {
        type: 'list',
        allowBlank: false,
        formulae: ['"iniciativa_decreto,punto_acuerdo,dictamen,proposicion,minuta,extraordinaria"']
    });
    
    iniciativasSheet.dataValidations.add('F2:F100', {
        type: 'list',
        allowBlank: true,
        formulae: ['"MORENA,PAN,PRI,PRD,PT,PVEM,MC,PES,RSP,FXM,INDEPENDIENTE,COMISIÓN"']
    });
    
    // Hoja 3: Instrucciones
    const instruccionesSheet = workbook.addWorksheet('INSTRUCCIONES');
    instruccionesSheet.columns = [
        { header: 'INSTRUCCIONES DE USO', key: 'instrucciones', width: 100 }
    ];
    
    const instrucciones = [
        { instrucciones: '1. HOJA "DATOS_SESION":' },
        { instrucciones: '   - Complete los campos con la información general de la sesión' },
        { instrucciones: '   - El campo NOMBRE_SESION es obligatorio' },
        { instrucciones: '   - La FECHA_PROPUESTA debe estar en formato YYYY-MM-DD' },
        { instrucciones: '' },
        { instrucciones: '2. HOJA "INICIATIVAS":' },
        { instrucciones: '   - Agregue una fila por cada iniciativa' },
        { instrucciones: '   - NUMERO_ORDEN_DIA: Número como aparece en el orden del día (ej: 4.1, 5.2)' },
        { instrucciones: '   - NUMERO: Número consecutivo interno' },
        { instrucciones: '   - TITULO: Título completo de la iniciativa' },
        { instrucciones: '   - TEXTO_COMPLETO: Descripción detallada o extracto del contenido' },
        { instrucciones: '   - PRESENTADOR: Nombre completo del diputado o comisión' },
        { instrucciones: '   - PARTIDO: Partido político del presentador' },
        { instrucciones: '   - TIPO_MAYORIA valores: simple, absoluta, calificada, unanime' },
        { instrucciones: '   - TIPO_INICIATIVA valores: iniciativa_decreto, punto_acuerdo, dictamen, etc.' },
        { instrucciones: '   - FECHA_PRESENTACION: Formato YYYY-MM-DD' },
        { instrucciones: '   - Elimine las filas de ejemplo antes de cargar' },
        { instrucciones: '' },
        { instrucciones: '3. TIPOS DE MAYORÍA:' },
        { instrucciones: '   - simple: Mayoría simple (50% + 1 de presentes)' },
        { instrucciones: '   - absoluta: Mayoría absoluta (2/3 de presentes)' },
        { instrucciones: '   - calificada: Mayoría calificada (2/3 del total)' },
        { instrucciones: '   - unanime: Unanimidad de presentes' },
        { instrucciones: '' },
        { instrucciones: '4. RECOMENDACIONES:' },
        { instrucciones: '   - No modifique los nombres de las columnas' },
        { instrucciones: '   - No cambie el nombre de las hojas' },
        { instrucciones: '   - Guarde el archivo en formato .xlsx' },
        { instrucciones: '   - Revise que no haya celdas con errores antes de cargar' }
    ];
    
    instruccionesSheet.addRows(instrucciones);
    
    // Aplicar formato a las instrucciones
    instruccionesSheet.getRow(1).font = { bold: true, size: 14 };
    instruccionesSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFC000' }
    };
    
    // Guardar el archivo
    const filePath = path.join(__dirname, 'public', 'plantilla_servicios_legislativos.xlsx');
    await workbook.xlsx.writeFile(filePath);
    console.log('✅ Plantilla Excel creada en:', filePath);
}

// Ejecutar
crearPlantillaExcel().catch(console.error);