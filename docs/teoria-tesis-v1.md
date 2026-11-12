# Marco teórico de la tesis
CAPÍTULO 2
MODELADO DE UN REACTOR TAD 

En este capítulo se desarrolla el modelo matemático que describe el comportamiento dinámico de un reactor TAD. El objetivo principal es formular las ecuaciones que gobiernan la evolución temporal de las variables clave del sistema, como la conversión, las concentraciones de reactivos y productos, y, en los casos correspondientes, la temperatura.

Para ello, se introducen los conceptos fundamentales que sustentan el diseño y la simulación de este tipo de reactores. Dichos conceptos permiten formular relaciones matemáticas que conectan el avance de la reacción con las condiciones bajo las que opera el sistema.

A continuación, se presentan los modelos de diseño bajo dos enfoques distintos: uno correspondiente a la operación isotérmica y otro que contempla la operación no isotérmica.
Las ecuaciones resultantes forman la base para el desarrollo computacional que se implementará en capítulos posteriores. La nomenclatura y los criterios de formulación empleados en este capítulo siguen las referencias clásicas de la bibliografía especializada, particularmente la de Fogler (2016), ampliamente utilizada en el estudio de reactores químicos.
	 Reactores TAD
Desde el punto de vista del diseño y simulación, el análisis de un TAD requiere un enfoque dinámico que contemple el cambio temporal de las variables del sistema. Esto indica una formulación basada en balances de materia y energía, considerando además aspectos claves; la estequiometria, la cinética química, el tipo de reacción y el modo de operación térmica. Cada uno de estos elementos será abordado en las siguientes secciones.
	Balance de moles
El análisis comienza con el balance general de moles sobre una especie j, el cual, en su forma general, para un sistema cerrado, se expresa como:
〖dN〗_j/dt=∫^V▒〖r_(j ) dV〗	(1)

donde:
	V es el volumen de mezcla reaccionante.
	r_(j ) es la velocidad de reacción del componente j.
	〖dN〗_j/dt   es la variación de moles de la especie j con respecto al tiempo.

La hipótesis de mezclado perfecto supone que la velocidad de reacción es homogénea en todo el volumen del reactor en cada instante de tiempo, por lo tanto, puede ser apartada del operador de integración. Al integrar y reescribir el balance de moles se obtiene la ecuación diferencial que expresa como varía la cantidad de moles de una especie con el tiempo debido exclusivamente a la reacción química (Ec. 2): 
〖dN〗_j/dt=r_j V	(2)

	Definición de conversión
En presencia de una única reacción, la conversión es una variable fundamental en el diseño y análisis de reactores, ya que permite cuantificar el progreso de la reacción en función de la cantidad de reactivo transformado. Para definirla, se selecciona uno de los reactivos como base de cálculo (generalmente el reactivo limitante), y se expresan las cantidades del resto de las especies en función de este (Fogler, 2016).

Considerando una reacción general del tipo:
aA + bB ↔cC+ dD 	(3)
Se toma al reactivo A como base de cálculo. Al dividir todos los coeficientes estequiométricos por a, se obtiene bajo criterios normalizados la reacción que se muestra en la Ec. 4.
A +  b/a B ↔  c/a C+  d/a D 	(4)
De esta manera, todas las relaciones se expresan en función de moles de A, lo que simplifica los balances estequiométricos y permite definir con claridad el parámetro de conversión. 

Para el reactor TAD, la conversión (X) se define como el número de moles de A que han reaccionado por mol de A alimentado al sistema (Ec. 5):
X=(N_A0- N_A (t))/N_A0 	(5)
donde:
	N_A0 es la cantidad inicial de moles de A,
	N_A (t) es la cantidad de moles de A en el reactor en el tiempo t.

Despejando N_A, se obtiene:
N_A (t)= N_A0 (1-X)	(6)
Esta relación permite sustituir el número de moles directamente por la conversión en los balances de materia, lo que facilita el desarrollo de las ecuaciones de diseño. Particularizando la Ec. 2, del balance molar para la especie A:

〖dN〗_A/dt=r_A V   	(7)

Derivando la Ec. 6 con respecto al tiempo, se obtiene:

〖dN〗_A/dt=〖-N〗_A0  dX/dt    	(8)

Sustituyendo en el balance molar (Ec. 7), resulta: 

dX/dt=(〖-r〗_A V)/N_A0 	(9)

Esta expresión permite calcular la evolución de la conversión en el tiempo.
	Velocidad de reacción
La velocidad de reacción describe la rapidez con la que se transforman los reactivos en productos en el interior del reactor. Esta velocidad, generalmente se expresa en unidades de moles por unidad de volumen de mezcla reaccionante y de tiempo. Depende de diversos factores, como la concentración de las especies involucradas, la temperatura del sistema y la presencia de catalizadores. Estos principios constituyen la base del análisis cinético en el diseño de reactores químicos (Fogler, 2016).

La reacción puede ser irreversible o reversible y, en consecuencia, se altera la expresión de la cinética de reacción. Considerando la reacción homogénea genérica (Ec. 3):

	En caso de ser una reacción irreversible, la velocidad de desaparición de A se puede expresar mediante una ley de velocidad empírica (Ec. 10).

-〖r 〗_A=k C_A^n  C_B^m 
(10)

	En el caso de ser una reacción reversible, la velocidad neta se expresa como la diferencia entre la velocidad de reacción directa y la velocidad de la reacción inversa, (Ec. 11).

-〖r 〗_A=〖r 〗_directa-〖r 〗_inversa=k_f  C_A^n  C_B^m -k_r  C_C^p  C_D^q  	(11)
Donde:
	k,k_f,k_r  son las constantes específicas de velocidad de reacción.
	C_A,〖 C〗_B,〖 C〗_C,〖 C〗_D  son las concentraciones de los reactivos y productos.
	n,m,p,q son los órdenes parciales de reacción correspondientes a cada reactivo o producto.

La constante específica de velocidad de reacción (k) está fuertemente influenciada por la temperatura, y esta dependencia se modela frecuentemente mediante la ecuación de Arrhenius (Ec. 12).
k=A⋅e^(-Ea/RT )
(12)
Donde:
	A es el factor pre exponencial o constante de frecuencia.
	Ea es la energía de activación.
	R es la constante universal de los gases.
	T es la temperatura absoluta.

En reacciones reversibles, k_f y k_r  representan las constantes específicas de velocidad para las reacciones directa e inversa, respectivamente, y también dependen de la temperatura según la Ec. 12. La relación entre ellas está determinada por la constante de equilibrio K_eq, la misma se analiza en la sección 2.1.7 del presente capítulo.

En sistemas isotérmicos, T se mantiene constante, por lo que k puede considerarse invariante con respecto al tiempo. Una forma útil y equivalente de la ecuación de Arrhenius es:

k=k(T_ref )  .exp⁡[E/R (1/T_ref -1/T)]	(13)
donde:
	k(T_ref )  es la constante de velocidad conocida a una temperatura de referencia T_ref.
	T es la temperatura actual del sistema.

En cambio, en sistemas no isotérmicos, T varía con el tiempo entonces la Ec.13 resulta especialmente práctica cuando se conoce el valor de k a una temperatura de referencia, y se desea calcular su variación a otras temperaturas durante la simulación. 

El conocimiento de la expresión de la velocidad de reacción, incluyendo la consideración de reversibilidad y la dependencia de la temperatura, es esencial para establecer el balance de materia del sistema y para calcular el tiempo necesario para alcanzar una conversión deseada (Levenspiel, 1999), como se verá en las secciones siguientes.
	Estequiometría
La estequiometría de una reacción permite establecer relaciones cuantitativas entre las distintas especies químicas involucradas. En el contexto de un TAD, esta relación se formula en función de la conversión del reactivo limitante, lo cual permite describir la evolución completa del sistema a partir de una única variable.

Considerando la reacción genérica (Ec. 3) y tomando como base de cálculo al reactivo limitante A, se define la conversión de A (Ec. 6). Tomando la estequiometría, se puede calcular el número de moles consumidos o formados de cada especie i, en función de X, mediante (Fogler, 2016):
N_i=N_i0+ ν_i  ( N_A0/(-ν_A )  )X	(14)
donde:
	N_i0 es la cantidad inicial de moles de la especie i.
	ν_i  es el coeficiente estequiométrico de la especie i (positivo para productos, negativo para reactivos).
	ν_A=-a, ya que es el coeficiente estequiométrico del reactivo A.

De este modo, para la reacción dada:
	B es un reactivo en exceso: 
N_B=N_B0-  b/a  N_A0 X	(15)
	C y D son productos:
N_C=N_C0+  c/a  N_A0 X	(16)
N_D=N_D0+  d/a  N_A0 X	(17)

	El número de moles de inertes (I), permanecen constantes: 
N_I=N_I0	(18)
	Concentraciones 
Para la mayoría de las reacciones en fase líquida, se considera que el volumen permanece constante, ya que los cambios de densidad durante la reacción son usualmente despreciables (Luyben, 2007). Las velocidades de reacción dependen típicamente de las concentraciones de los reactivos. Por ello, es necesario expresar dichas concentraciones en función de X, y se logra gracias a la relación (Ec. 19).

C_i=N_i/V	(19)

Aplicando la expresión de N_A en función de la conversión (Ec. 6), se obtiene la Ec. 20:

C_A=C_(A0 ) (1-X)	(20)

Similarmente para las otras especies: 
C_B=C_B0-b/a C_(A0 ) X	(21)
C_C=C_C0+c/a C_(A0 ) X	(22)
C_D=C_D0+d/a C_(A0 ) X	(23)

Estas expresiones permiten reescribir la velocidad de reacción como función de la conversión, lo cual es clave para integrar el balance de materia del reactor. A partir de aquí, es posible formular la ecuación de diseño, lo que se desarrollará en las siguientes secciones.
	Diseño isotérmico del TAD
En condiciones isotérmicas, la temperatura se del sistema se mantiene constante, lo que conlleva a que la constante de velocidad k también sea constante, de acuerdo con la ecuación de Arrhenius (Ec. 12). Esta suposición simplifica el análisis, ya que permite formular la cinética de reacción sin depender de un balance de energía. 

Partiendo del balance molar de A, se tiene la ecuación de diseño diferencial del TAD (Ec. 9). En sistemas en fase líquida, es posible reescribir esta expresión en términos de concentración inicial del reactivo A (Ec. 24). 

dX/dt=〖-r〗_A/C_A0 	(24)

Para evaluar -r_A, se utilizarán las expresiones generales previamente presentadas en la sección de Velocidad de Reacción.

En condiciones isotérmicas, la temperatura se del sistema se mantiene constante, lo que conlleva a que la constante de velocidad k también sea constante, de acuerdo con la ecuación de Arrhenius (Ec. 12). Esta suposición simplifica el análisis, ya que permite formular la cinética de reacción sin depender de un balance de energía. 

Este análisis constituye la base para el diseño y la simulación de TAD isotérmicos. En el desarrollo computacional posterior, se implementarán tanto el modelo de primer orden como el de segundo orden, lo que permite abarcar una amplia gama de situaciones cinéticas representativas en la práctica.
	Producción y cálculo del volumen del reactor
En un TAD, un parámetro clave para el dimensionamiento es la producción deseada del producto principal (Ec. 25). Esta producción, se expresa como masa de producto generado por unidad de tiempo, permite relacionar el volumen requerido del reactor para alcanzar un objetivo específico en condiciones definidas de operación.

Se define la producción de un producto k como:

P_k=(masa de k formada)/(tiempo de operación)	(25)

Donde el tiempo de operación total incluye el tiempo de reacción (t_reacción) y los tiempos de carga, descarga y eventuales tiempos muertos (t_mcd)  del ciclo operativo (Ec. 26).

t_op=〖(t〗_reacción+t_mcd) N_ciclos	(26)

Durante la operación del reactor, la mezcla reacciona y alcanza una concentración final 〖 C〗_k en el volumen del reactor V. Si se conoce la concentración final del producto, la masa generada en una operación es:
m_k= C_k  V 〖PM〗_k	(27)
donde:
	C_k, es la concentración final del producto.
	〖PM〗_k es el peso molecular del producto k.
	V es el volumen del reactor.

Finalmente, la producción másica de k es: 

P_k=( C_k  V 〖PM〗_k)/(t_reacción+t_mcd  )	(28)

Despejando el volumen necesario del reactor, se obtiene:

V=(P_k  〖(t〗_reacción+t_mcd) )/(C_k   〖PM〗_k )	(29)

Esta expresión es útil para el diseño preliminar del tamaño del TAD en función de los requerimientos de producción, la concentración alcanzada del producto, su peso molecular y los tiempos operativos involucrados (Fogler, 2016; Luyben, 2007).
	Equilibrio
En una reacción reversible, el sistema químico tiende a alcanzar un estado en el cual la velocidad de reacción directa es igual a la velocidad de reacción inversa. Este estado se conoce como equilibrio químico y determina un límite máximo para la conversión alcanzable, denominado conversión de equilibrio X_eq. (Fogler, 2016).

El equilibrio está gobernado por la constante de equilibrio K¬¬_eq, que para una reacción reversible general del tipo (Ec. 3) y considerando comportamiento ideal de la solución, se puede aproximar como (Ec. 30) (Smith et al., 2005).

K_eq=K_c=(C_c^c.C_D^d)/(C_A^a.C_B^b )
(30)

Dentro del análisis de reactores, resulta clave reconocer que la conversión objetivo está limitada por la conversión de equilibrio impuesta por las variables operativas. Por lo tanto, el equilibrio actúa como un condicionante fisicoquímico que restringe el rendimiento del reactor. 

Además, para reacciones reversibles, la velocidad de reacción neta puede reescribirse en función de la constante de equilibrio, mientras exista consistencia termodinámica entre las expresiones de cinética y de equilibrio (Levenspiel, 1999). Por lo tanto, para una reacción de general (Ec. 3) la velocidad de desaparición del reactivo A puede expresarse como:

〖-r〗_A=k.(C_A^n C_B^m-(C_c^p.C_D^q)/K_eq )
(31)

Esta formulación es útil por que combina en una sola expresión la velocidad de reacción directa e inversa, haciendo explicita la influencia de K¬_eq. 

Cuando el sistema alcanza el equilibrio, el término entre paréntesis se anula, lo cual implica que la velocidad neta es cero y la conversión deja de variar. Esta condición es clave para el diseño de un TAD con reacciones reversibles, ya que indica que no es posible superar el rendimiento determinado por X_eq, independientemente del tiempo de reacción o de las condiciones iniciales (Fogler, 2016).
	Cálculo del equilibrio mediante la energía de Gibbs
La constante de equilibrio K_c se relaciona con la energía libre de Gibbs de la reacción a una temperatura dada, 〖∆G〗_rxn^0, mediante la expresión (Fogler, 2016): 

K_c (T)=exp⁡((- 〖∆G〗_rxn^0)/RT)	(32)
donde:
	R es la constante de los gases.
	T es la temperatura absoluta.
	 〖∆G〗_rxn^0 es la variación de energía libre estándar para la reacción:

〖∆G〗_rxn^0=∑▒〖ν_(i ) 〖∆G〗_f^0 (i)〗	(33)

Los 〖∆G〗_f^0 (i) son los valores estándares de energía libre de formación de cada especie i, y ν_(i )sus coeficientes estequiométricos (positivos para productos, negativos para reactivos). Esta metodología permite calcular K_c a una temperatura determinada, ya sea constante (modo isotérmico) o variable (modo no isotérmico).
	Cálculo del equilibrio mediante la ecuación de Van´t Hoff
Cuando se conoce K_(c,ref ) a una temperatura de referencia T_ref, la constante de equilibrio a otra temperatura T, puede estimarse mediante la ecuación de Van’t Hoff. Por ejemplo, en el caso para el cual el calor de reacción puede considerarse constante en el rango de trabajo, se obtiene la Ec. 34.

ln⁡((K_c (T))/(K_c (T_ref ) ))= -(〖∆H〗_rxn^0)/R (1/T-1/T_ref )	(34)

Despejando K_c (T), se obtiene una forma explícita que permite calcular la constante de equilibrio en función de la temperatura:

K_c (T)=K_c (T_ref ).exp⁡[(〖∆H〗_rxn^0)/R (1/T_ref -1/T)]  	(35)
	Cálculo de la conversión de equilibrio
Una vez conocida la constante de equilibrio K_c (T), se puede calcular la conversión de equilibrio resolviendo la expresión de equilibrio para la reacción (Ec. 36):

K_c (T)=(∏▒〖C_i^vi (X_eq)〗)/(∏▒〖C_j^vj (X_eq)〗)	(36)
Dónde i son productos y j reactivos.

Donde C_i (Xeq) son las concentraciones de equilibrio expresadas en función de la conversión de equilibrio X_eq, usando balances estequiométricos y volumen constante. La conversión de equilibrio Xeq se obtiene resolviendo esta ecuación.
	Diseño no isotérmico del TAD
Cuando se presenta una variación de la temperatura de la mezcla reaccionante con el tiempo, el diseño del TAD debe incorporar el balance de energía. Esta variación puede deberse a la generación de calor por la reacción (en caso de ser exotérmica o endotérmica) y/o a la presencia de intercambio térmico con un sistema de refrigeración o calentamiento externo.

El balance de energía para un reactor TAD se deriva de la ley de conservación de la energía para sistemas cerrados, considerando los términos de acumulación de energía, trabajo, calor transferido y energía generada por reacción (Fogler, 2016). Su expresión general:

dT/dt=(Q ̇-(W_s ) ̇+(-∆Hrx)(-r_A V))/(∑_i▒〖N_i C_(P,i) 〗)	(37)
donde:
	T  es la temperatura del sistema.
	Q ̇ es el calor intercambiado entre el sistema y los alrededores.
	W ̇s es el trabajo de eje.
	ΔHrx es el calor de reacción por mol de A.
	rA es la velocidad de desaparición de A.
	V es el volumen de mezcla reaccionante.
	Ni es el número de moles de cada especie i.
	Cp,i es la capacidad calorífica molar de la especie i.

Al despreciar el trabajo de eje y considerando que se elimine calor a través del sistema de intercambio, el balance se expresa como:  

dT/dt=(Q ̇_gb-Q ̇_rb)/(∑_i▒〖N_i C_(P,i) 〗)	(38)

Donde el calor generado o absorbido por reacción química se define:

(Q_gb ) ̇=(-ΔH_rx )(-〖r〗_A V)
(39)

Q ̇¬_rb, representa el calor retirado (cuando es negativo) o suministrado (cuando es positivo) por un intercambiador térmico. En un reactor con camisa de enfriamiento o calefacción, el término de calor removido se calcula como:

Q ̇_rb =mC_p (T-T_a2 )[1-exp(-UA/(mC_p ) )]
(40)
donde:
	m es el caudal másico del fluido de intercambio.
	C_p  su capacidad calorífica específica.
	T¬_a2 es la temperatura del fluido de intercambio a la salida.
	UA es el producto coeficiente global de transferencia por el área de intercambio.

El número de moles de cada especie, en términos de la conversión X (Ec. 41) permite escribir una versión simplificada del balance energético (Ec. 42):
N_i =N_A0 (Θ_i +ν_i X)
(41)
donde:
	Θi es la relación molar N_i0 ,/N_A0.

dT/dt =(Q_gb -Q_rb )/(〖N〗_A0 (∑_i▒〖Θ_i 〖C〗_(p,i) +〖ΔC〗_(p,i) X) 〗 )
(42)

La presente versión se adapta bien a su aplicación en un entorno de programación y debe acoplarse al balance de materia en función de la conversión (Ec 9). Estas dos ecuaciones diferenciales acopladas una para T(t), otra X(t) constituyen el modelo no isotérmico base, sobre el cual se construyen los escenarios particulares de operación adiabática y operación con intercambio térmico, que se desarrollarán en las próximas subsecciones.
	Capacidad calorífica del sistema
La capacidad calorífica del sistema (C_(p,total)) desempeña un papel fundamental dentro del balance de energía y se puede calcular mediante la Ec. 43. Para sistemas líquidos puede suponerse que la capacidad calorífica de la mezcla sufre cambios relativamente despreciables con respecto a su valor inicial (Fogler, 2016):

C_(p,total)=∑_i▒〖N_i C_(P,i) 〗  	(43)
∑_i▒〖N_i C_(P,i) 〗  ≅ ∑_i▒〖〖N_i〗^0 C_(P,i) 〗	(44)

	Calor de reacción
El calor de reacción estándar ΔHrx(T) depende de la temperatura. Suponiendo que las capacidades caloríficas son constantes en un dado rango de temperatura, se puede expresar como (Fogler, 2016):

ΔHrx(T)=〖ΔH〗_rx^0 (T_R )+∑_i▒〖v_i C_(p,i)^0  〗(T-T_R) 
(45)
donde:
	〖ΔH〗_rx^0 (T_R ) es el calor de reacción evaluado a una temperatura de referencia T_R.
	∑_i▒〖v_i C_(p,i)^0  〗 representa el cambio total en la capacidad calorífica.
	Operación adiabática del reactor TAD
En una operación adiabática, el reactor no intercambia calor con su entorno:
(Q_rb ) ̇=0	(46)
En estos casos, el aumento o disminución de la temperatura es causado únicamente por el calor generado o consumido por la propia reacción química (Ec. 47). 
dT/dt=((-ΔHRx)(-r_A V))/(∑_i▒〖N_i C_(P,i) 〗)	(47)
Combinando esta expresión con el balance de moles del TAD (Ec. 9), se obtiene una ecuación que relaciona directamente la temperatura con la conversión, eliminando el tiempo como variable intermedia. A través de un proceso de integración y reorganización algebraica, se llega a una expresión explícita y práctica en sistemas adiabáticos para calcular la temperatura alcanzada como función de la conversión:
T=T_0 + ([-ΔHrx(T_0 )]X)/(∑_i▒〖Θ_i C_(P,i) 〗+X⋅∑_i▒〖v_i C_(p,i)^0  〗)  	(48)
donde:
	T_0 es la temperatura inicial del sistema,
	Θi es la relación molar N_i0 ,/N_A0,
	Cp,i es la capacidad calorífica molar de cada especie,
	∑_i▒〖v_i C_(p,i)^0  〗  es el cambio global de capacidad calorífica con la reacción.

Estas expresiones permiten calcular fácilmente la temperatura alcanzada para un valor dado de conversión, o viceversa. 
	Operación con intercambiador de calor (ICQ)
En muchas aplicaciones industriales, los TAD están equipados con sistemas de intercambio térmico que permiten controlar la temperatura del sistema. Estos sistemas pueden incluir camisas externas, serpentines internos o recirculación de fluido térmico, cuya función es extraer o aportar calor a la mezcla reaccionante. El modelo de balance de energía para un TAD con intercambio de calor incorpora tanto el calor de reacción y el intercambiado (Fogler, 2016). La ecuación en términos generales, despreciando el trabajo de eje (Ec. 38):

dT/dt=(Q ̇_gb-Q ̇_rb)/(∑_i▒〖N_i C_(P,i) 〗)

	Q ̇_gb calor generado o consumido por la reacción (Ec 39).
	(Q_rb ) ̇ representa el calor del intercambiador incorporado (Ec.40).

La ecuación de balance de energía puede combinarse con el balance de materia (Ec. 24) para obtener un modelo acoplado. 

En un TAD, el área de intercambio puede variar con el nivel del líquido. En este trabajo, se asume un valor constante para A, lo cual es válido para sistemas con geometría estable o volumen operativo fijo (Fogler, 2016).




> Pegá abajo, debajo de la línea, el marco teórico de la tesis «Modelado y Simulación de un Reactor Batch en Python». No hace falta que respete ningún formato: puede ir el texto tal cual sale del Word o del PDF, con ecuaciones como sean.
> Cuando esté, avisale a Claude y lo va a ordenar en secciones (nomenclatura, ley de velocidad, Arrhenius, equilibrio, balances, dimensionamiento, supuestos), con las ecuaciones en LaTeX y notas sobre dónde está cada una en el código.

---
## AQUI ABAJO ESTA EL MODELO PLANTEADO EN LA TESIS V1:

	 Modelo planteado
En esta sección se detalla el modelo matemático adoptado para simular el comportamiento dinámico de un reactor TAD operando en fase líquida. A partir de los fundamentos teóricos desarrollados en la sección 2.1, se plantea una formulación especifica que contempla distintos escenarios operativos y cinéticos.

El modelo propuesto se basa en una única reacción reversible o irreversible, bajo condiciones de mezcla perfecta y volumen constante.

Se consideran dos formas de operación térmica: modo isotérmico, en el que la temperatura se mantiene constante, y modo no isotérmico, donde la temperatura evoluciona dinámicamente como resultado del calor de reacción y del posible intercambio térmico con un fluido de servicio.

Asimismo, se contemplan dos casos cinéticos: reacciones de primer orden y de segundo orden global, lo que permite explorar diferentes comportamientos dinámicos del sistema. El objetivo de esta sección es definir con exactitud las ecuaciones que rigen la evolución de la conversión y, cuando corresponda, de la temperatura, estableciendo las bases para su posterior implementación numérica.
	Reacción considerada 
Para el desarrollo del modelo se elige una reacción química reversible, homogénea y en fase liquida, de tipo general (Ec. 3).

El modelo asume la presencia de una única reacción, sin competencia entre reacciones paralelas o consecutivas, por lo que no se contempla la formación de subproductos ni mecanismos complejos. Esta simplificación resulta adecuada para propósitos de simulación didáctica, análisis de sensibilidad y comparación entre distintos regímenes térmicos y órdenes de reacción.

Además, contempla la posibilidad de tratar la reacción como reversible o irreversible. En el caso irreversible, solo se proporciona la constante de velocidad directa k y no se considera el equilibrio químico (asumiendo que la velocidad inversa es cero). Si se trata de una reacción reversible, el usuario además debe ingresar datos del equilibrio, considerando K_eq, y el modelo incorpora el equilibrio en el cálculo de la velocidad de reacción. Esta flexibilidad permite adaptar el simulador a múltiples escenarios de interés práctico.
	Hipótesis asumida
El modelo planteado se desarrolla bajo un conjunto de hipótesis que permiten simplificar el sistema sin perder generalidad en el análisis de la dinámica del TAD. Estas suposiciones se adoptaron con el objetivo de facilitar la formulación matemática, reducir la complejidad computacional y enfocarse en los aspectos fundamentales del comportamiento del reactor.

Las hipótesis consideradas son las siguientes:
	Sistema cerrado: No existe entrada ni salida de materia durante la reacción.
	Reacción única: Se considera una única reacción química reversible (o irreversible).
	Fase líquida homogénea: El sistema se encuentra completamente en fase liquida, sin formación de fases adicionales ni interfaces.
	Mezcla perfecta: Se asume que el contenido del reactor está perfectamente mezclado, las propiedades intensivas (temperatura y concentración) son uniformes en todo el volumen.
	Volumen constante: El volumen de mezcla reaccionante no varía durante la reacción.
	Sin trabajo de eje: El trabajo mecánico asociado al agitador se desprecia en el balance de energía.
	Capacidades caloríficas constantes: Los valores de Cp se consideran constantes con la temperatura.

Según el tipo de operación elegido, se aplican dos modos operativos:

	Modo isotérmico: La temperatura del sistema permanece constante durante toda la reacción.
	Modo no isotérmico: La temperatura puede variar a lo largo del tiempo, ya sea por ser un sistema adiabático o por la presencia de un sistema de intercambio de calor.

Estas hipótesis constituyen el marco de validez del modelo matemático que será utilizado para simular el comportamiento del reactor TAD en las condiciones establecidas. 

Gracias a las hipótesis adoptadas, es posible reescribir varias ecuaciones claves que serán utilizadas en el simulador. En particular, se asume que la capacidad calorífica de la mezcla se mantiene constante. Esta aproximación, comúnmente utilizada en la literatura (por ejemplo, en Fogler 2016), permite enfocar el análisis en la dinámica térmica del sistema sin introducir mayores fuentes de no linealidad.

En este trabajo, se desprecia el término ∑_i▒〖v_i C_(p,i)^0  〗 ⋅(T-TR), (Ec. 45) asumiendo que el calor de reacción se mantiene constante e igual a su valor estándar a la temperatura de referencia:

ΔH¬_rx (T)≈〖ΔH〗_rx^0 (T_r )
(49)

Como consecuencia, se simplifica el tratamiento del balance energético, especialmente en el denominador de las expresiones diferenciales, sin comprometer de forma significativa la precisión de los resultados.

Bajo estas condiciones, siempre que ΔHrx y C_(p,total) se mantengan aproximadamente constantes, las ecuaciones diferenciales del sistema térmico pueden reescribirse de forma simplificada (Ecs.50-52).
dT/dt=(Q ̇_gb-Q ̇_rb)/(Cp,total )	(50)
	
dT/dt=[-ΔHrx(T_0 )](-r_A V)/(Cp,total)
(51)
	
T=T_0 + ([-ΔHrx(T_0 )]X)/(Cp,total)
(52)

Estas formas simplificadas permiten una implementación más eficiente del modelo en el simulador, manteniendo un compromiso aceptable entre rigor físico y rendimiento computacional.
	Casos cinéticos modelados
El modelo cinético implementado permite representar distintos comportamientos de velocidad de reacción dependiendo del orden global. A partir de la conversión X, se determinan las concentraciones de los reactivos utilizando la relación estequiométrica y el supuesto de volumen constante.

La concentración del reactivo limitante A se calcula a partir de la Ec. 20. La concentración del reactivo B (si está presente en la estequiometría) se calcula a partir de la Ec. 21. En caso de reacción irreversible, se modela exclusivamente la velocidad directa (r_directa) mediante la ley de velocidad empírica (Ec. 10).

Los casos cinéticos implementados en el simulador para esta expresión son:
	Primer Orden Global:
-r_A=r_directa=k .C_A
(53)
Este caso se corresponde con n=1 y m=0, lo que implica que la velocidad depende únicamente de la concentración del reactivo limitante A. 
	Segundo Orden Global:
-r_A=r_directa= k .C_A  .C_B
(54)
Este caso, con n=1 y m=1, la velocidad depende tanto de A como de B. Es un caso representativo de una reacción biomolecular, con consumo simultáneo de ambos.

Cuando la reacción es de segundo orden global se tiene en cuenta también el caso de pseudo-primer orden, donde se considera que la concentración inicial de B  permanece constante durante la reacción: 
-r_A= r_directa=k .C_B^0.C_A=k^'.C_A  
(55)
Este modelo reduce la expresión cinética a una ley de velocidad de primer orden aparente en A, pero con una constante efectiva k^'=k.C_B^0.

Por último, también se plantea la forma cuadrática de origen experimental:
-r_A= r_directa=k .C_A^2
(56)

Cuando la reacción es reversible, el modelo incorpora también la velocidad inversa (implementando la Ec. 11), y la velocidad neta se ajusta según la constante de equilibrio K_eq . En fase liquida, Keq es aproximadamente igual a Kx (constante de equilibrio en términos de fracciones molares) La expresión utilizada en el simulador es la siguiente ecuación cinética: 

〖-r〗_inversa=k_r  C_C  C_D  	(57)
K_eq=k_d/k_r    	(58)
〖-r〗_A=r_directa-k  ( C_C.C_D)/K_eq 
(59)

Las formas presentadas permiten calcular la velocidad neta de reacción y modelar con precisión el acercamiento al equilibrio.
	Ecuaciones por resolver
Finalmente, el comportamiento dinámico del TAD se describe mediante un sistema de ecuaciones diferenciales ordinarias (EDOs) que representan los balances de materia y energía. Estas ecuaciones permiten modelar la evolución de las variables clave del sistema: conversión X, en el caso no isotérmico, también la temperatura  T. La resolución numérica de estas ecuaciones constituye la base de la simulación implementada. Para la resolución también se implementan reacciones complementarias e integradoras: 

	Ecuaciones integradoras y conectoras entre ambos modos de operación, se resumen en las Tablas 1, 2 y 3:




Tabla 1: Resumen de ecuaciones que rigen la cinética.
N°	Ecuaciones que rigen la cinética	Descripción
53	-〖r 〗_A=k C_A  	Velocidad de reacción directa de primer orden global 
54	-r_A=k .C_A  .C_B
Velocidad de reacción directa de segundo orden global, con B definido
55	-r_A=k .C_B^0.C_A=k^'.C_A
Velocidad de reacción directa de psudo-primer orden
56	-r_A=k .C_A^2
Velocidad de reacción directa de segundo orden global, con B indefinido
59	〖-r〗_A=r_directa-k  ( C_C.C_D)/K_eq 
Ecuación de cinética para reacción   reversible planteada en función del equilibrio
12	k=A⋅e^(-Ea/RT )
Ecuación de Arrhenius
13	k=k(T_ref )  .exp⁡[E/R (1/T_ref -1/T)]	Constante de equilibrio en función de la temperatura 

Tabla 2: Resumen de ecuaciones estequiométricas.
N°	Ecuaciones estequiométricas	Descripción
20	C_A=C_(A0 ) (1-X)	Concentraciones de A en función de X
21	C_B=C_B0-b/a C_(A0 ) X	Concentraciones de B en función de X
22	C_C=C_C0+c/a C_(A0 ) X	Concentraciones de C en función de X
23	C_D=C_D0+d/a C_(A0 ) X	Concentraciones de D en función de X.

Tabla 3: Resumen de ecuaciones que rigen el equilibrio químico.
N°	Ecuaciones que rigen el equilibrio	Descripción
31	〖-r〗_A=k.(C_A^n C_B^m-(C_c^p.C_D^q)/K_eq )	Velocidad de reacción reversible en función del equilibrio
32	K_c (T)=exp⁡((- 〖∆G〗_rxn^0)/RT)	Cálculo del equilibrio mediante la Energía de Gibbs
33	〖∆G〗_rxn^0=∑▒〖ν_(i ) 〖∆G〗_f^0 (i)〗	Energía libre de Gibbs
35	K_c (T)=K_c (T_ref )*exp⁡(  (〖∆H〗_rxn^0)/R(1/T_ref -1/T))	Constante de equilibrio en función de la temperatura, mediante la Ecuación de Van’t Hoff
36	K_c (T)=(∏▒〖C_i^vi (Xeq)〗)/(∏▒〖C_j^vj (Xeq)〗)	Constante de equilibrio en función de la conversión de equilibrio



	Diseño del reactor TAD y cálculo del volumen:

Tabla 4: Resumen de ecuaciones Diseño del reactor TAD y cálculo de volumen.
N°	Ecuación	Descripción
24	dX/dt=〖-r〗_A/C_A0 	Ecuación de diseño de reactor TAD en función de la concentración. 
29	V=(P_k  〖(t〗_reacción+t_mcd) )/(C_k   〖PM〗_k )	Volumen necesario del reactor para lograr una producción deseada〖 P〗_k
D
	 Operación No Isotérmica:

Tabla 5: Resumen de ecuaciones Modo No Isotérmico.
N°	Ecuaciones Modo No Isotérmico	Descripción
39	Q ̇gb=(-ΔHrx)(-〖r〗_A V)
Calor generado o absorbido por el TAD
40	Q ̇_rb =mC_p (T-T_a2 )[1-exp(-UA/(mC_p ) )]
Calor removido o introducido en el TAD
50	dT/dt=(Q ̇_gb-Q ̇_rb)/C_(p,total) 	Balance de energía
No Isotérmico
51	dT/dt=((-ΔHrx)(-〖r〗_A V))/C_(p,total) 
Balance de energía
No Isotérmico Adiabático

52	T=T_0 + [-ΔHrx(T_0 )]X/C_(p,total) 
Temperatura adiabática alcanzada como función de la conversión

Este conjunto de ecuaciones constituye el modelo dinámico que será resuelto numéricamente en el capítulo siguiente. Su formulación permite abordar distintos escenarios térmicos y cinéticos, y evaluar su impacto sobre la conversión, la temperatura y el rendimiento del TAD bajo condiciones transitorias realistas.
















