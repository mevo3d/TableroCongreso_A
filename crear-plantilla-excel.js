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
        { header: 'NUMERO', key: 'numero', width: 10 },
        { header: 'TITULO', key: 'titulo', width: 50 },
        { header: 'DESCRIPCION', key: 'descripcion', width: 60 },
        { header: 'PRESENTADOR', key: 'presentador', width: 30 },
        { header: 'PARTIDO', key: 'partido', width: 15 },
        { header: 'TIPO_MAYORIA', key: 'tipo_mayoria', width: 15 },
        { header: 'TIPO_INICIATIVA', key: 'tipo_iniciativa', width: 15 },
        { header: 'COMISION', key: 'comision', width: 30 },
        { header: 'TURNO', key: 'turno', width: 15 },
        { header: 'OBSERVACIONES', key: 'observaciones', width: 40 }
    ];
    
    // Agregar ejemplos de iniciativas
    iniciativasSheet.addRows([
        {
            numero: 1,
            titulo: 'EJEMPLO: Iniciativa de Ley de Educación',
            descripcion: 'EJEMPLO: Reforma al artículo 15 de la Ley de Educación del Estado',
            presentador: 'Dip. Juan Pérez González',
            partido: 'MORENA',
            tipo_mayoria: 'simple',
            tipo_iniciativa: 'ordinaria',
            comision: 'Educación y Cultura',
            turno: 'Primera Lectura',
            observaciones: 'Urgente y obvia resolución'
        },
        {
            numero: 2,
            titulo: 'EJEMPLO: Punto de Acuerdo Económico',
            descripcion: 'EJEMPLO: Exhorto al Ejecutivo para implementar medidas de seguridad',
            presentador: 'Dip. María López Hernández',
            partido: 'PAN',
            tipo_mayoria: 'absoluta',
            tipo_iniciativa: 'punto_acuerdo',
            comision: 'Seguridad Pública',
            turno: 'Única Lectura',
            observaciones: ''
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
    iniciativasSheet.dataValidations.add('F2:F100', {
        type: 'list',
        allowBlank: false,
        formulae: ['"simple,absoluta,calificada,unanime"']
    });
    
    iniciativasSheet.dataValidations.add('G2:G100', {
        type: 'list',
        allowBlank: false,
        formulae: ['"ordinaria,extraordinaria,punto_acuerdo,decreto"']
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
        { instrucciones: '   - El campo NUMERO debe ser único y consecutivo' },
        { instrucciones: '   - TITULO y PRESENTADOR son obligatorios' },
        { instrucciones: '   - TIPO_MAYORIA valores válidos: simple, absoluta, calificada, unanime' },
        { instrucciones: '   - TIPO_INICIATIVA valores válidos: ordinaria, extraordinaria, punto_acuerdo, decreto' },
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